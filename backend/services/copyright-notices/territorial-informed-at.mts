import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'
import { TERRITORIAL_COMPLAINT_WINDOW_MONTHS } from './territorial-fields.mts'

export type TerritorialInformedWindow = {
  informed_at: Date | null
  window_ends_at: Date | null
}

/** Only delivery of this decision's first poster/notifier notice starts the recipient clock. */
export async function getTerritorialInformedWindow(
  input: {
    noticeId: string
    decidedAt: Date
    posterUserId?: string
    notifier: boolean
  },
  transaction: TransactionQuery,
): Promise<TerritorialInformedWindow> {
  const { rows } = await transaction<TerritorialInformedWindow>(sql`
    /* getTerritorialInformedWindow */
    WITH informed AS (
      SELECT intent.recipient_role, MIN(intent.sent_at) AS informed_at
      FROM copyright_notice_delivery_intents intent
      WHERE intent.copyright_notice_id = ${input.noticeId}
        AND intent.state = 'sent'
        AND intent.sent_at >= ${input.decidedAt}
        AND (
          (${input.notifier} AND intent.recipient_role = 'claimant'
            AND intent.delivery_kind = ${copyrightDecisionDeliveryKinds[1]})
          OR (${input.posterUserId ?? null}::uuid IS NOT NULL
            AND intent.recipient_role = 'poster'
            AND intent.recipient_user_id = ${input.posterUserId ?? null}
            AND intent.delivery_kind = ${copyrightDecisionDeliveryKinds[0]})
        )
      GROUP BY intent.recipient_role
    )
    SELECT CASE WHEN COUNT(*) = ${Number(input.notifier) + Number(Boolean(input.posterUserId))}
      THEN MIN(informed_at) ELSE NULL END AS informed_at,
      CASE WHEN COUNT(*) = ${Number(input.notifier) + Number(Boolean(input.posterUserId))}
      THEN MAX((informed_at AT TIME ZONE 'UTC' + make_interval(months => ${TERRITORIAL_COMPLAINT_WINDOW_MONTHS})) AT TIME ZONE 'UTC')
      ELSE NULL END AS window_ends_at
    FROM informed
  `)
  return rows[0] ?? { informed_at: null, window_ends_at: null }
}
