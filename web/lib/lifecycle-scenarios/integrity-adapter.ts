import {
  lifecycleNotApplicable,
  numberValue,
  stringArrayValue,
  stringValue,
  type LifecycleAdapter,
} from './adapters'
import type { LifecycleJson } from './manifest'
import {
  hasNewIntegrityPenalty,
  isResolvedIntegrityFlag,
  isRevokedIntegrityPenalty,
} from '@/components/admin/integrity-reconciliation'
import {
  IntegrityFlagMutationController,
  type IntegrityFlagMutationKind,
} from '@/components/admin/integrity-flag-mutation-controller'
import { isAmbiguousIntegrityMutationFailure } from '@/components/admin/use-integrity-penalties'

function controlledExactRead<T>(
  outcome: Record<string, LifecycleJson>,
  state: T,
): () => Promise<T> {
  return () =>
    outcome.exactRead === 'failed'
      ? Promise.reject(new Error('Controlled lifecycle exact read failed'))
      : Promise.resolve(state)
}

async function controlledMutation(outcome: Record<string, LifecycleJson>): Promise<void> {
  if (outcome.mutation === 'succeeded') return
  throw new Error('Controlled lifecycle mutation outcome is ambiguous')
}

async function reconcileControlledMutation<T>(input: {
  canRetryPenaltyAfterReconciliation?: (state: T) => boolean
  exactState: T
  flagId: string
  kind: IntegrityFlagMutationKind
  outcome: Record<string, LifecycleJson>
}): Promise<{ controller: IntegrityFlagMutationController<T>; exactState?: T }> {
  let exactState: T | undefined
  const controller = new IntegrityFlagMutationController<T>({
    applyConfirmedFlag: state => {
      exactState = state
    },
    canRetryPenaltyAfterReconciliation: state =>
      input.canRetryPenaltyAfterReconciliation?.(state) === true,
    getFlag: () => controlledExactRead(input.outcome, input.exactState)().then(flag => ({ flag })),
    uncertainMessage: 'mutation-outcome-unknown',
  })
  if (!controller.acquire(input.flagId, input.kind)) return { controller }
  try {
    await controlledMutation(input.outcome)
    controller.release(input.flagId)
  } catch (error) {
    if (!isAmbiguousIntegrityMutationFailure(error)) {
      controller.fail(input.flagId, 'mutation-outcome-unknown')
      return { controller }
    }
    if (input.kind === 'penalty') controller.preventPenaltyRetry(input.flagId)
    await controller.reconcile(input.flagId, input.kind)
  }
  return { controller, exactState }
}

export const webIntegrityReconciliation: LifecycleAdapter = async input => {
  const action = stringValue(input.action, 'type')
  const outcome = input.serverOutcome
  if (action === 'apply-vote-penalty') {
    const baseline = new Set(stringArrayValue(input.preconditions, 'baselinePenaltyIds'))
    const current = stringArrayValue(outcome, 'exactReadPenaltyIds')
    const result = await reconcileControlledMutation({
      canRetryPenaltyAfterReconciliation: ids => !hasNewIntegrityPenalty(baseline, new Set(ids)),
      exactState: current,
      flagId: 'vote-penalty',
      kind: 'penalty',
      outcome,
    })
    const committed = hasNewIntegrityPenalty(baseline, new Set(result.exactState))
    return {
      visibleState: {
        penaltyApplied: committed,
        error: committed ? null : 'mutation-outcome-unknown',
      },
      availableActions: committed
        ? ['revoke']
        : result.controller.canAcquire('vote-penalty', 'penalty')
          ? ['apply-penalty']
          : [],
      reconciliation: {
        strategy: 'exact-read',
        comparison: committed ? 'new-row' : 'unchanged-baseline',
      },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (action === 'revoke-report-penalty' || action === 'revoke-vote-penalty') {
    const result = await reconcileControlledMutation({
      exactState: {
        revoked_at: outcome.exactReadRevoked === true ? 'confirmed' : null,
      },
      flagId: 'penalty-revocation',
      kind: 'resolve',
      outcome,
    })
    const committed =
      result.exactState !== undefined && isRevokedIntegrityPenalty(result.exactState)
    return {
      visibleState: { revoked: committed, error: committed ? null : 'mutation-outcome-unknown' },
      availableActions: [],
      reconciliation: { strategy: 'exact-read', committed },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (action === 'resolve-report') {
    const result = await reconcileControlledMutation({
      exactState: {
        resolved_at: stringValue(outcome, 'exactReadStatus') === 'resolved' ? 'confirmed' : null,
      },
      flagId: 'report-resolution',
      kind: 'resolve',
      outcome,
    })
    const committed = result.exactState !== undefined && isResolvedIntegrityFlag(result.exactState)
    const failed = result.controller.state.reconciliationRequired['report-resolution'] === true
    return {
      visibleState: {
        reportStatus: committed ? 'resolved' : 'pending',
        error: committed ? null : 'mutation-outcome-unknown',
      },
      availableActions: failed ? ['retry'] : [],
      reconciliation: failed ? { strategy: 'fail-closed' } : { strategy: 'exact-read', committed },
      cancellation: lifecycleNotApplicable,
    }
  }
  if (action === 'apply-report-penalty') {
    const baselinePenaltyCount = numberValue(input.preconditions, 'penaltyCount') ?? 0
    const exactReadPenaltyCount = numberValue(outcome, 'exactReadPenaltyCount')
    const result = await reconcileControlledMutation({
      canRetryPenaltyAfterReconciliation: count =>
        count === undefined || count <= baselinePenaltyCount,
      exactState: exactReadPenaltyCount,
      flagId: 'report-penalty',
      kind: 'penalty',
      outcome,
    })
    const committed = result.exactState !== undefined && result.exactState > baselinePenaltyCount
    return {
      visibleState: {
        penaltyApplied: committed,
        error: committed ? null : 'mutation-outcome-unknown',
      },
      availableActions: committed
        ? ['revoke']
        : result.controller.canAcquire('report-penalty', 'penalty')
          ? ['apply-penalty']
          : [],
      reconciliation: { strategy: 'exact-read', committed },
      cancellation: lifecycleNotApplicable,
    }
  }
  throw new Error(`Unknown web integrity lifecycle action: ${action}`)
}
