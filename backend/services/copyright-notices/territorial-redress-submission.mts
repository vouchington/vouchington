import { lockCopyrightNoticeLifetime } from './notice-lifetime.mts'
import { CopyrightReplayAdmission } from './replay-admission.mts'
import { findCopyrightReplayIdentity } from './replay-identity-store.mts'
import { recordCopyrightReplayIdentity } from './replay-identity-create.mts'
import { openCopyrightSecrets } from './encryption-keys.mts'
import { beginTransaction } from '@data-stores/psql'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  assertBoundedText,
  assertIdempotencyKey,
  type TerritorialCopyrightJurisdiction,
} from './territorial-fields.mts'
import { getTerritorialInformedWindow } from './territorial-informed-at.mts'
import { territorialLabels } from './territorial-labels.mts'
import {
  insertTerritorialRedressRequest,
  selectExistingTerritorialRedressRequest,
  selectTerritorialRedressParent,
} from './territorial-redress-sql.mts'

export type TerritorialCopyrightRedressRequest = { id: string; is_duplicate: boolean }

export async function submitTerritorialCopyrightRedress(
  actor: PrivateUser,
  noticeId: string,
  idempotencyKey: string,
  explanation: string,
  jurisdiction: TerritorialCopyrightJurisdiction,
): Promise<TerritorialCopyrightRedressRequest> {
  const labels = territorialLabels(jurisdiction)
  assertIdempotencyKey(idempotencyKey)
  const text = assertBoundedText(explanation, 50_000, 'explanation is required')
  // ast-grep-ignore: no-three-sequential-awaits -- The transaction, shared erasure lifetime, and notice row must be acquired in that order before replay metadata.
  await using transaction = await beginTransaction()
  const noticeLifetime = await lockCopyrightNoticeLifetime(transaction, noticeId)
  await transaction(sql`/* submitTerritorialCopyrightRedress:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const replayInput = {
    family: 'territorial_redress' as const,
    jurisdiction,
    identity: JSON.stringify([actor.id, idempotencyKey]),
    requester: actor.id,
    request: JSON.stringify({ noticeId, explanation: text }),
  }
  const replayAdmission = await CopyrightReplayAdmission.open(
    transaction,
    replayInput,
    noticeLifetime,
  )
  const retained = await findCopyrightReplayIdentity(replayAdmission)
  if (retained) {
    const replay = await retained.replay()
    await transaction.commit()
    assert(replay.liveSnapshot, 404, labels.decisionNotFound)
    const result = replay.liveSnapshot as Record<string, unknown>
    assert(typeof result.id === 'string', 500, 'Invalid retained territorial redress receipt')
    return { id: result.id, is_duplicate: true }
  }
  const { rows: parents } = await transaction<{
    id: string
    decided_at: Date
    outcome: 'restrict' | 'no_action'
    authorizing_assessment_identity_id: string | null
    requester_user_id: string | null
  }>(selectTerritorialRedressParent(jurisdiction, noticeId))
  const parent = parents[0]
  assert(parent, 404, labels.decisionNotFound)

  const notifier = actor.id === parent.requester_user_id
  const posterSql = sql`/* submitTerritorialCopyrightRedress:poster */
    SELECT EXISTS (
      SELECT 1 FROM copyright_notice_targets target
      CROSS JOIN LATERAL `
  posterSql.append(copyrightPlacementPartiesSql('respond'))
  posterSql.append(sql` party
      WHERE target.copyright_notice_id = ${noticeId}
        AND party.user_id = ${actor.id}
    ) AS poster`)
  const { rows: posterRows } = await transaction<{ poster: boolean }>(posterSql)
  const poster = parent.outcome === 'restrict' && (posterRows[0]?.poster ?? false)
  const reviewer = currentUserCanReviewCopyrightNotices(actor)
  assert(notifier || poster || reviewer, 403, 'Forbidden')

  const { rows: existing } = await transaction<{
    id: string
    copyright_notice_id: string
    copyright_territorial_decision_id: string
  }>(selectExistingTerritorialRedressRequest(jurisdiction, parent.id, actor.id, idempotencyKey))
  if (existing[0]) {
    assert(
      existing[0].copyright_notice_id === noticeId &&
        existing[0].copyright_territorial_decision_id === parent.id,
      409,
      'Idempotency-Key was reused',
    )
    await transaction.commit()
    return { id: existing[0].id, is_duplicate: true }
  }

  if (!reviewer) {
    const window = await getTerritorialInformedWindow(
      {
        noticeId,
        decidedAt: parent.decided_at,
        notifier,
        posterUserId: poster ? actor.id : undefined,
      },
      transaction,
    )
    const { rows: clocks } = await transaction<{ now: Date }>(
      sql`/* submitTerritorialCopyrightRedress:clock */ SELECT CURRENT_TIMESTAMP AS now`,
    )
    assert(
      !window.window_ends_at || clocks[0]!.now <= window.window_ends_at,
      422,
      'The complaint period for this decision has ended',
    )
  }
  await using secrets = await openCopyrightSecrets(
    { kind: 'notice', id: noticeId },
    transaction,
    'write',
  )
  const { encryptSecret } = secrets
  const { rows } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      jurisdiction,
      noticeId,
      parent.id,
      parent.outcome,
      parent.authorizing_assessment_identity_id,
      actor.id,
      notifier ? 'notifier' : poster ? 'poster' : 'reviewer',
      idempotencyKey,
      encryptSecret(text, `${labels.redressPurpose}:${idempotencyKey}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, labels.redressFailed)
  await recordCopyrightReplayIdentity(replayAdmission, noticeId, 'redress_received', {
    id: created.id,
  })
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}
