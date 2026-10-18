import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightDecisionDeliveryKinds } from './delivery-types.mts'
import { TERRITORIAL_COMPLAINT_WINDOW_MONTHS } from './territorial-fields.mts'

export type TerritorialInformedWindow = {
  informed_at: Date | null
  window_ends_at: Date | null
}

type InformedWindowRequest = {
  noticeId: string
  decidedAt: Date
  posterUserId?: string
  notifier: boolean
}

/** Only delivery of this decision's first poster/notifier notice starts the recipient clock. */
export async function getTerritorialInformedWindow(
  input: InformedWindowRequest,
  transaction: TransactionQuery,
): Promise<TerritorialInformedWindow> {
  return (await getTerritorialInformedWindows([input], transaction))[0]!
}

/** Reviewer complaints never start a recipient clock, so they need no window. */
export function complaintWindowRequests(
  { noticeId, decidedAt }: { noticeId: string; decidedAt: Date },
  row: { filed_by: 'notifier' | 'poster' | 'reviewer'; submitted_by_id: string | null },
): InformedWindowRequest[] {
  if (row.filed_by === 'reviewer') return []
  const posterUserId = row.filed_by === 'poster' ? (row.submitted_by_id ?? undefined) : undefined
  return [{ noticeId, decidedAt, notifier: row.filed_by === 'notifier', posterUserId }]
}

/** One statement answers every request; results align with `requests`. */
export async function getTerritorialInformedWindows(
  requests: readonly InformedWindowRequest[],
  transaction: TransactionQuery,
): Promise<TerritorialInformedWindow[]> {
  if (requests.length === 0) return []
  const { rows } = await transaction<TerritorialInformedWindow & { request_index: number }>(sql`
    /* getTerritorialInformedWindows */
    WITH request AS (
      SELECT request_index::int - 1 AS request_index, notice_id, decided_at, poster_user_id, notifier
      FROM unnest(
        ${requests.map(item => item.noticeId)}::uuid[],
        ${requests.map(item => item.decidedAt)}::timestamptz[],
        ${requests.map(item => item.posterUserId ?? null)}::uuid[],
        ${requests.map(item => item.notifier)}::boolean[]
      ) WITH ORDINALITY AS listed(notice_id, decided_at, poster_user_id, notifier, request_index)
    ), informed AS (
      SELECT request.request_index, intent.recipient_role, MIN(intent.sent_at) AS informed_at
      FROM request
      JOIN copyright_notice_delivery_work_items intent
        ON intent.copyright_notice_id = request.notice_id
        AND intent.state = 'sent'
        AND intent.sent_at >= request.decided_at
        AND (
          (request.notifier AND intent.recipient_role = 'claimant'
            AND intent.delivery_kind = ${copyrightDecisionDeliveryKinds[1]})
          OR (request.poster_user_id IS NOT NULL
            AND intent.recipient_role = 'poster'
            AND intent.recipient_user_id = request.poster_user_id
            AND intent.delivery_kind = ${copyrightDecisionDeliveryKinds[0]})
        )
      GROUP BY request.request_index, intent.recipient_role
    )
    SELECT request.request_index,
      CASE WHEN COUNT(informed.informed_at) =
        request.notifier::int + (request.poster_user_id IS NOT NULL)::int
      THEN MIN(informed.informed_at) ELSE NULL END AS informed_at,
      CASE WHEN COUNT(informed.informed_at) =
        request.notifier::int + (request.poster_user_id IS NOT NULL)::int
      THEN MAX((informed.informed_at AT TIME ZONE 'UTC' + make_interval(months => ${TERRITORIAL_COMPLAINT_WINDOW_MONTHS})) AT TIME ZONE 'UTC')
      ELSE NULL END AS window_ends_at
    FROM request
    LEFT JOIN informed ON informed.request_index = request.request_index
    GROUP BY request.request_index, request.notifier, request.poster_user_id
  `)
  const windows = requests.map(
    () => ({ informed_at: null, window_ends_at: null }) as TerritorialInformedWindow,
  )
  for (const row of rows)
    windows[row.request_index] = {
      informed_at: row.informed_at,
      window_ends_at: row.window_ends_at,
    }
  return windows
}
