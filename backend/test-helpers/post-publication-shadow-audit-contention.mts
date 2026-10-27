import { beginTransaction } from '@data-stores/psql'
import { postPublicationScopeLockKey } from '../services/post-publication/lock.mts'
import {
  postPublicationShadowAuditLockKey,
  runPostPublicationShadowAudit,
} from '../services/post-publication/shadow-audit.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import {
  assertAuditOutcomes,
  auditOutcome,
  configureBoundedContender,
  observeAuditWait,
  prepareAuditLockObservation,
  reusableSessionBudget,
  restoreAuditSessionBudget,
  withAuditSessions,
  type AuditTransaction,
} from './post-publication-shadow-audit-sessions.mts'

/** Keep the global holder locked until this actual audit has timed out and rolled back. */
export async function observeGlobalShadowAuditCancellation(holderPid: number, signal: AbortSignal) {
  return withAuditSessions(signal, false, async sessions => {
    await using observer = await beginTransaction({ client: sessions.observer })
    const baseline = await reusableSessionBudget(sessions.contender)
    await using observation = await prepareAuditLockObservation(
      holderPid,
      postPublicationShadowAuditLockKey,
      sessions.contender,
      observer,
    )
    await observation.ready
    await using contender = await beginTransaction({ client: sessions.contender })
    const timeoutMs = await configureBoundedContender(contender)
    const contenderPid = await getTestPostgresBackendProcessId(contender)
    signal.throwIfAborted()
    const operation = auditOutcome(
      runPostPublicationShadowAudit({ dryRun: false, limit: 1 }, { query: contender }),
    )
    const observed = await auditOutcome(
      observeAuditWait(
        observation,
        holderPid,
        contenderPid,
        'lockPostPublicationShadowAudit',
        observer,
        operation,
        signal,
      ),
    )
    // Never release the global holder while this query can still enter the global sweep.
    const result = await operation
    const [rollback, observerRollback] = await Promise.all([
      auditOutcome(contender.rollback()),
      auditOutcome(observer.rollback()),
    ])
    const restored = await auditOutcome(restoreAuditSessionBudget(observation, sessions.contender))
    const supporting = [observed, rollback, observerRollback, restored]
    if (!result.ok && supporting.every(value => value.ok) && restored.ok) {
      return {
        holderPid,
        contenderPid,
        timeoutMs,
        baseline,
        restored: restored.value,
        failure: result.err,
      }
    }
    assertAuditOutcomes(
      result.ok
        ? {
            ok: false,
            err: new Error('Contending global audit unexpectedly passed its reserved lock'),
          }
        : result,
      supporting,
      'Global audit contention or cleanup failed',
    )
    throw new Error('Global audit outcome must include its expected cancellation')
  })
}

/** Two finite repairs; a blocked successor drains even if releasing its predecessor fails. */
export async function observeScopedShadowAuditSuccess(postId: string, signal: AbortSignal) {
  return withAuditSessions(signal, true, async sessions => {
    if (!sessions.holder) throw new Error('Scoped audit requires an independent holder')
    await using observer = await beginTransaction({ client: sessions.observer })
    await using holder = await beginTransaction({ client: sessions.holder })
    const baseline = await reusableSessionBudget(sessions.contender)
    const holderPid = await getTestPostgresBackendProcessId(holder)
    const options = { dryRun: false, limit: 1, postIdentityIds: [postId] }
    signal.throwIfAborted()
    const first = await runPostPublicationShadowAudit(options, { query: holder })
    signal.throwIfAborted()
    await using observation = await prepareAuditLockObservation(
      holderPid,
      postPublicationScopeLockKey({ type: 'post', postId }),
      sessions.contender,
      observer,
    )
    await observation.ready
    await using contender = await beginTransaction({ client: sessions.contender })
    const timeoutMs = await configureBoundedContender(contender)
    const contenderPid = await getTestPostgresBackendProcessId(contender)
    signal.throwIfAborted()
    const operation = auditOutcome(runPostPublicationShadowAudit(options, { query: contender }))
    const observed = await auditOutcome(
      observeAuditWait(
        observation,
        holderPid,
        contenderPid,
        'lockPostPublicationScope',
        observer,
        operation,
        signal,
      ),
    )
    const holderRollback = await auditOutcome(holder.rollback())
    // Drain BEFORE disposal, even when rollback or observation failed; the query has its own bound.
    const second = await operation
    const repair = second.ok
      ? await auditOutcome(readOwnedRepair(contender, postId))
      : ({ ok: true, value: undefined } as const)
    const [rollback, observerRollback] = await Promise.all([
      auditOutcome(contender.rollback()),
      auditOutcome(observer.rollback()),
    ])
    const restored = await auditOutcome(restoreAuditSessionBudget(observation, sessions.contender))
    assertAuditOutcomes(
      second,
      [observed, holderRollback, repair, rollback, observerRollback, restored],
      'Scoped audit contention or cleanup failed',
    )
    return {
      first,
      second: second.ok ? second.value : undefined,
      repair: repair.ok ? repair.value : undefined,
      holderPid,
      contenderPid,
      timeoutMs,
      baseline,
      restored: restored.ok ? restored.value : undefined,
    }
  })
}

async function readOwnedRepair(query: AuditTransaction, postId: string) {
  const { rows } = await query<{ post_identity_id: string; reasons: string[] }>(
    `/* readContendedShadowRepair */ SELECT post_identity_id, reasons::text[] AS reasons
     FROM post_publication_dirty_work WHERE post_identity_id = $1`,
    [postId],
  )
  return rows[0]
}
