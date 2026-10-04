import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type {
  DsaCopyrightComplaintBucket,
  DsaCopyrightComplaintFigures,
} from './eu-reporting-figure-types.mts'
import { inAreaTrustedFlaggerMatchSql } from './trusted-flagger-match.mts'

export type { DsaCopyrightComplaintFigures } from './eu-reporting-figure-types.mts'

type StoredBucket = DsaCopyrightComplaintBucket & { median_hours: number | null }
type ComplaintFigureRow = {
  notifier: number
  poster: number
  reviewer: number
  by_decision_type: Record<'restrict' | 'no_action' | 'no_action_trusted_flagger', StoredBucket>
}

function reportBucket(bucket: StoredBucket): DsaCopyrightComplaintBucket {
  const { median_hours, ...counts } = bucket
  return median_hours === null ? counts : { ...counts, median_hours }
}

/** Immutable filed_by survives actor erasure; receipt and decision periods are independent. */
export async function readDsaCopyrightComplaintFigures(
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<DsaCopyrightComplaintFigures> {
  const query = sql`/* readDsaCopyrightComplaintFigures */
    WITH received AS (
      SELECT request.filed_by, complained.outcome,
        `
    .append(inAreaTrustedFlaggerMatchSql(sql``.append('request.copyright_notice_id')))
    .append(sql` AS trusted
      FROM copyright_territorial_redress_requests request
      JOIN copyright_territorial_decisions complained
        ON complained.id = request.copyright_territorial_decision_id
      WHERE request.jurisdiction = 'eu_dsa'
        AND request.received_at >= ${periodStartedAt}
        AND request.received_at < ${periodEndedAt}
    ), decided AS (
      SELECT complained.outcome, decision.staff_disposition,
        EXTRACT(EPOCH FROM (decision.decided_at - request.received_at)) / 3600.0 AS hours,
        `)
    .append(inAreaTrustedFlaggerMatchSql(sql``.append('request.copyright_notice_id')))
    .append(sql` AS trusted
      FROM copyright_territorial_redress_decisions decision
      JOIN copyright_territorial_redress_requests request
        ON request.id = decision.copyright_territorial_redress_request_id
      JOIN copyright_territorial_decisions complained
        ON complained.id = request.copyright_territorial_decision_id
      WHERE request.jurisdiction = 'eu_dsa'
        AND decision.decided_at >= ${periodStartedAt}
        AND decision.decided_at < ${periodEndedAt}
    ), buckets AS (
      SELECT bucket FROM (VALUES ('restrict'), ('no_action'), ('no_action_trusted_flagger'))
        AS definitions(bucket)
    ), metrics AS (
      SELECT bucket,
        (SELECT count(*)::integer FROM received WHERE
          received.outcome = bucket OR
          (bucket = 'no_action_trusted_flagger' AND received.outcome = 'no_action'
            AND received.trusted)) AS received,
        (SELECT count(*)::integer FROM decided WHERE
          decided.staff_disposition = 'maintain' AND
          (decided.outcome = bucket OR
            (bucket = 'no_action_trusted_flagger' AND decided.outcome = 'no_action'
              AND decided.trusted))) AS upheld,
        (SELECT count(*)::integer FROM decided WHERE
          decided.staff_disposition = 'revoke' AND
          (decided.outcome = bucket OR
            (bucket = 'no_action_trusted_flagger' AND decided.outcome = 'no_action'
              AND decided.trusted))) AS reversed,
        (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 2)::double precision
          FROM decided WHERE decided.outcome = bucket OR
            (bucket = 'no_action_trusted_flagger' AND decided.outcome = 'no_action'
              AND decided.trusted)) AS median_hours
      FROM buckets
    )
    SELECT
      (SELECT count(*)::integer FROM received WHERE filed_by = 'notifier') AS notifier,
      (SELECT count(*)::integer FROM received WHERE filed_by = 'poster') AS poster,
      (SELECT count(*)::integer FROM received WHERE filed_by = 'reviewer') AS reviewer,
      (SELECT jsonb_object_agg(bucket, jsonb_build_object(
        'received', received, 'upheld', upheld, 'partially_reversed', 0,
        'reversed', reversed, 'median_hours', median_hours)) FROM metrics)
        AS by_decision_type
  `)
  const { rows } = await read<ComplaintFigureRow>(query)
  const row = rows[0]
  assert(row, 500, 'Failed to count DSA copyright complaints')
  return {
    complaints_by_submitter: {
      notifier: row.notifier,
      poster: row.poster,
      reviewer: row.reviewer,
    },
    complaints_by_decision_type: {
      restrict: reportBucket(row.by_decision_type.restrict),
      no_action: reportBucket(row.by_decision_type.no_action),
      no_action_trusted_flagger: reportBucket(row.by_decision_type.no_action_trusted_flagger),
    },
  }
}
