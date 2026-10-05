import { beginTransaction } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@services/media-delivery-safety/copyright-placement-parties'
import { selectCopyrightParticipantStatements } from './participant-statements.mts'
import type {
  CopyrightParticipantNoticeDetail,
  CopyrightPublicNoticeDetail,
} from './read-models-notice-types.mts'
import { getTerritorialInformedWindow } from './territorial-informed-at.mts'
import { selectEuParticipantSettlements } from './read-models-eu-settlements.mts'
import { territorialDecisionIsLiveSql } from './territorial-redress-sql.mts'
import { territorialLabels } from './territorial-labels.mts'
/** EU participants can read a received case before staff accepts or declines it. */
export async function getEuParticipantNoticeDetail(
  noticeId: string,
  currentUser: PrivateUser,
  viewerRole: 'claimant' | 'poster' | 'staff',
  acceptedDetail: CopyrightPublicNoticeDetail | null,
): Promise<CopyrightParticipantNoticeDetail | null> {
  await using transaction = await beginTransaction()
  const { rows: notices } = await transaction<{
    id: string
    received_at: Date
    claimant_user_id: string | null
    accepted_at: Date | null
    provisional_withholding_at: Date | null
  }>(sql`/* getEuParticipantNoticeDetail:notice */
    SELECT id, received_at, claimant_user_id, accepted_at, provisional_withholding_at
    FROM copyright_notices WHERE id = ${noticeId} AND jurisdiction = 'eu_dsa'
  `)
  const notice = notices[0]
  if (!notice) return null
  const decisionSql = sql`/* getEuParticipantNoticeDetail:decision */
    SELECT decision.id, decision.outcome, decision.decided_at,
      (SELECT MIN(redress_decision.decided_at)
       FROM copyright_territorial_redress_requests request
       JOIN copyright_territorial_redress_decisions redress_decision
         ON redress_decision.copyright_territorial_redress_request_id = request.id
       WHERE request.copyright_territorial_decision_id = decision.id
         AND redress_decision.staff_disposition = 'revoke'
         AND decision.outcome = 'no_action') AS reopened_at
    FROM copyright_territorial_decisions decision
    WHERE decision.copyright_notice_id = ${noticeId} AND decision.jurisdiction = 'eu_dsa' AND `
  decisionSql.append(territorialDecisionIsLiveSql())
  const { rows: decisions } = await transaction<{
    id: string
    outcome: 'restrict' | 'no_action'
    decided_at: Date
    reopened_at: Date | null
  }>(decisionSql)
  const decision = decisions[0]
  const targetSql = sql`/* getEuParticipantNoticeDetail:respondableTargets */
    SELECT DISTINCT target.id FROM copyright_notice_targets target CROSS JOIN LATERAL `
  targetSql.append(copyrightPlacementPartiesSql('respond'))
  targetSql.append(sql` party WHERE target.copyright_notice_id = ${noticeId}
    AND party.user_id = ${currentUser.id} ORDER BY target.id`)
  const { rows: targets } = await transaction<{ id: string }>(targetSql)
  const notifier = notice.claimant_user_id === currentUser.id
  const poster = targets.length > 0
  const informed =
    decision && (notifier || poster)
      ? await getTerritorialInformedWindow(
          {
            noticeId,
            decidedAt: decision.decided_at,
            notifier,
            posterUserId: poster ? currentUser.id : undefined,
          },
          transaction,
        )
      : { informed_at: null, window_ends_at: null }
  const { rows: requests } = decision
    ? await transaction<{
        id: string
        idempotency_key: string
        filed_by: 'notifier' | 'poster' | 'reviewer'
        received_at: Date
        explanation_ciphertext: string
        staff_disposition: 'maintain' | 'revoke' | null
        rationale_ciphertext: string | null
        redress_decided_at: Date | null
      }>(sql`/* getEuParticipantNoticeDetail:ownComplaint */
        SELECT request.id, request.idempotency_key, request.filed_by, request.received_at,
          request.explanation_ciphertext, redress_decision.staff_disposition,
          redress_decision.rationale_ciphertext, redress_decision.decided_at AS redress_decided_at
        FROM copyright_territorial_redress_requests request
        LEFT JOIN copyright_territorial_redress_decisions redress_decision
          ON redress_decision.copyright_territorial_redress_request_id = request.id
        WHERE request.copyright_territorial_decision_id = ${decision.id}
          AND request.submitted_by_id = ${currentUser.id}
        ORDER BY request.id DESC LIMIT 1
      `)
    : { rows: [] }
  const own = requests[0]
  const labels = territorialLabels('eu_dsa')
  const complaint = {
    can_submit:
      !!decision &&
      !decision.reopened_at &&
      !own &&
      (viewerRole === 'staff' || !informed.window_ends_at || new Date() <= informed.window_ends_at),
    window_ends_at: informed.window_ends_at,
    request: own
      ? {
          id: own.id,
          received_at: own.received_at,
          filed_by: own.filed_by,
          explanation: decryptSecret(
            own.explanation_ciphertext,
            `${labels.redressPurpose}:${own.idempotency_key}`,
          ),
        }
      : null,
    decision:
      own?.staff_disposition && own.rationale_ciphertext && own.redress_decided_at
        ? {
            staff_disposition: own.staff_disposition,
            rationale: decryptSecret(
              own.rationale_ciphertext,
              `${labels.redressDecisionPurpose}:${own.id}`,
            ),
            decided_at: own.redress_decided_at,
          }
        : null,
  }
  const settlements = await selectEuParticipantSettlements(
    noticeId,
    currentUser.id,
    viewerRole === 'staff',
    transaction,
  )
  const [{ rows: submissions }, statements] = await Promise.all([
    transaction<CopyrightParticipantNoticeDetail['submissions'][number]>(sql`
      SELECT id, kind, received_at, source_kind FROM copyright_notice_submissions
      WHERE copyright_notice_id = ${noticeId}
        AND (${viewerRole === 'staff'} OR submitted_by_id = ${currentUser.id})
      ORDER BY received_at, id
    `),
    selectCopyrightParticipantStatements(noticeId, currentUser.id, viewerRole, transaction),
  ])
  await transaction.commit()
  return {
    ...(acceptedDetail ?? {
      id: notice.id,
      jurisdiction: 'eu_dsa' as const,
      received_at: notice.received_at,
      accepted_at: notice.accepted_at,
      provisional_withholding_at: notice.provisional_withholding_at,
      target_count: 0,
      claimant: null,
      targets: [],
      timeline: [],
    }),
    viewer_role: viewerRole,
    respondable_target_ids: [],
    submissions,
    statements,
    eu: {
      outcome: decision?.outcome ?? null,
      decided_at: decision?.decided_at ?? null,
      informed_at: informed.informed_at,
      reopened_at: decision?.reopened_at ?? null,
      complaint,
      dispute_settlements: settlements.results,
      dispute_settlements_page_info: settlements.page_info,
    },
  }
}
