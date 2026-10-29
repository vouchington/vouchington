import { beginTransaction } from '@data-stores/psql'
import { openCopyrightSecretsForCiphertexts } from './encryption-keys.mts'
import { decryptCopyrightText } from './erased-ciphertext.mts'
import type { PrivateUser } from '@services/users/types'
import sql from 'sql-template-strings'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import { selectCopyrightParticipantStatements } from './participant-statements.mts'
import type {
  CopyrightParticipantNoticeDetail,
  CopyrightPublicNoticeDetail,
} from './read-models-notice-types.mts'
import { getTerritorialInformedWindow } from './territorial-informed-at.mts'
import { selectEuParticipantSettlements } from './read-models-eu-settlements.mts'
import { territorialLabels } from './territorial-labels.mts'

type SubmissionRow = CopyrightParticipantNoticeDetail['submissions'][number]

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
  const { rows: decisions } = await transaction<{
    id: string
    outcome: 'restrict' | 'no_action'
    decided_at: Date
    reopened_at: Date | null
  }>(sql`/* getEuParticipantNoticeDetail:decision */
    SELECT notice.current_territorial_decision_identity_id AS id,
      notice.territorial_decision_outcome AS outcome,
      notice.territorial_decided_at AS decided_at,
      (SELECT MIN(request.decided_at)
       FROM copyright_territorial_redress_requests request
       WHERE request.copyright_territorial_decision_id = notice.current_territorial_decision_identity_id
         AND request.staff_disposition = 'revoke'
         AND notice.territorial_decision_outcome = 'no_action') AS reopened_at
    FROM copyright_notices notice
    WHERE notice.id = ${noticeId} AND notice.jurisdiction = 'eu_dsa'
      AND notice.current_territorial_decision_identity_id IS NOT NULL`)
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
          request.explanation_ciphertext, request.staff_disposition,
          request.rationale_ciphertext, request.decided_at AS redress_decided_at
        FROM copyright_territorial_redress_requests request
        WHERE request.copyright_territorial_decision_id = ${decision.id}
          AND request.submitted_by_id = ${currentUser.id}
        ORDER BY request.id DESC LIMIT 1
      `)
    : { rows: [] }
  const own = requests[0]
  await using secrets = await openCopyrightSecretsForCiphertexts(
    { kind: 'notice', id: noticeId },
    [own?.explanation_ciphertext ?? null, own?.rationale_ciphertext ?? null],
    transaction,
  )
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
          explanation: decryptCopyrightText(
            own.explanation_ciphertext,
            `${labels.redressPurpose}:${own.idempotency_key}`,
            secrets,
          ),
        }
      : null,
    decision:
      own?.staff_disposition && own.rationale_ciphertext && own.redress_decided_at
        ? {
            staff_disposition: own.staff_disposition,
            rationale: decryptCopyrightText(
              own.rationale_ciphertext,
              `${labels.redressDecisionPurpose}:${own.id}`,
              secrets,
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
    transaction<SubmissionRow>(sql`/* getEuParticipantNoticeDetail:submissions */
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
