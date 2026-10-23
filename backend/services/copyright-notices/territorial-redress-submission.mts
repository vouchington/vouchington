import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'
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
  await using transaction = await beginTransaction()
  const requesterIdentitySha256 = createHash('sha256').update(actor.id).digest()
  await transaction(sql`/* submitTerritorialCopyrightRedress:identityLock */
    SELECT pg_advisory_xact_lock(hashtextextended(
      ${`territorial-redress:${actor.id}:${idempotencyKey}`}, 0))`)
  const { rows: retained } = await transaction<{ response_snapshot: unknown }>(sql`
    /* submitTerritorialCopyrightRedress:retained */
    SELECT response_snapshot FROM copyright_territorial_redress_retained_identities
    WHERE requester_identity_sha256 = ${requesterIdentitySha256}
      AND jurisdiction = ${jurisdiction} AND idempotency_key = ${idempotencyKey}`)
  if (retained[0]) {
    const snapshot = retained[0].response_snapshot
    assert(
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot),
      500,
      'Invalid retained territorial redress receipt',
    )
    const result = snapshot as Record<string, unknown>
    assert(
      typeof result.id === 'string' &&
        result.notice_id === noticeId &&
        typeof result.decision_id === 'string',
      409,
      'Idempotency-Key was reused',
    )
    await transaction.commit()
    return { id: result.id, is_duplicate: true }
  }
  await transaction(sql`/* submitTerritorialCopyrightRedress:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE
  `)
  const { rows: parents } = await transaction<{
    id: string
    decided_at: Date
    outcome: 'restrict' | 'no_action'
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
  const { rows } = await transaction<{ id: string }>(
    insertTerritorialRedressRequest(
      jurisdiction,
      noticeId,
      parent.id,
      actor.id,
      notifier ? 'notifier' : poster ? 'poster' : 'reviewer',
      idempotencyKey,
      encryptSecret(text, `${labels.redressPurpose}:${idempotencyKey}`),
    ),
  )
  const created = rows[0]
  assert(created, 500, labels.redressFailed)
  await transaction(sql`/* retainTerritorialRedressReceiptIdentity */
    INSERT INTO copyright_territorial_redress_retained_identities (
      requester_identity_sha256, jurisdiction, idempotency_key, response_snapshot
    ) VALUES (${requesterIdentitySha256}, ${jurisdiction}, ${idempotencyKey},
      jsonb_build_object('id', ${created.id}::text, 'notice_id', ${noticeId}::text,
        'decision_id', ${parent.id}::text))`)
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}
