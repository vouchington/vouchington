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
  await transaction.commit()
  return { id: created.id, is_duplicate: false }
}
