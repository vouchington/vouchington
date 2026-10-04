import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  aiGuidanceSql,
  automatedAssessmentSql,
  automaticRestrictionSql,
} from './automated-assessment-sql.mts'
import type { DsaCopyrightNoticeFigures } from './eu-reporting-figure-types.mts'
import { DSA_COPYRIGHT_NOTICE_JURISDICTIONS } from './eu-reporting-population.mts'
import { inAreaTrustedFlaggerMatchSql } from './trusted-flagger-match.mts'

export type { DsaCopyrightNoticeFigures } from './eu-reporting-figure-types.mts'

type NoticeFigureRow = Omit<
  DsaCopyrightNoticeFigures,
  'actions_on_terms_count' | 'actions_on_terms_trusted_flagger_count'
> & {
  median_hours_to_action: number | null
  median_hours_to_action_trusted_flagger: number | null
}

/** One aggregate read; receipt and imposition use their own half-open UTC periods. */
export async function readDsaCopyrightNoticeFigures(
  periodStartedAt: Date,
  periodEndedAt: Date,
): Promise<DsaCopyrightNoticeFigures> {
  const population = [...DSA_COPYRIGHT_NOTICE_JURISDICTIONS]
  const noticeAlias = sql``.append('notice.id')
  const query = sql`/* readDsaCopyrightNoticeFigures */
    WITH received AS (
      SELECT notice.id, notice.received_at,
        `
    .append(inAreaTrustedFlaggerMatchSql(noticeAlias))
    .append(sql` AS trusted,
        CASE WHEN notice.jurisdiction = 'us_dmca' THEN
          (SELECT count(*)::integer FROM copyright_notice_targets target
            WHERE target.copyright_notice_id = notice.id)
          ELSE 1 END AS items,
        (`)
    .append(aiGuidanceSql('notice'))
    .append(sql` OR EXISTS (
          SELECT 1 FROM copyright_notice_submissions submission
          JOIN copyright_notice_submission_assessments assessment
            ON assessment.copyright_notice_submission_id = submission.id
          WHERE submission.copyright_notice_id = notice.id AND submission.kind = 'notice'
            AND (`)
    .append(automatedAssessmentSql('assessment'))
    .append(sql`)
        )) AS automated
      FROM copyright_notices notice
      WHERE notice.jurisdiction = ANY(${population}::text[])
        AND notice.received_at >= ${periodStartedAt}
        AND notice.received_at < ${periodEndedAt}
    ), imposed AS (
      SELECT restriction.id, notice.id AS notice_id, notice.received_at,
        `)
    .append(inAreaTrustedFlaggerMatchSql(sql``.append('notice.id')))
    .append(sql` AS trusted, `)
    .append(automaticRestrictionSql('restriction')).append(sql` AS automated
      FROM copyright_restrictions restriction
      JOIN copyright_notices notice ON notice.id = restriction.copyright_notice_id
      WHERE restriction.imposed_at >= ${periodStartedAt}
        AND restriction.imposed_at < ${periodEndedAt}
        AND notice.jurisdiction = ANY(${population}::text[])
    ), acted_notice AS (
      SELECT imposed.notice_id, bool_or(imposed.trusted) AS trusted,
        min(imposed.received_at) AS received_at
      FROM imposed GROUP BY imposed.notice_id
    ), elapsed AS (
      SELECT acted_notice.trusted,
        EXTRACT(EPOCH FROM (first_withhold.completed_at - acted_notice.received_at)) / 3600.0
          AS hours
      FROM acted_notice
      JOIN LATERAL (
        SELECT min(intent.completed_at) AS completed_at
        FROM copyright_notice_action_intents intent
        WHERE intent.copyright_notice_id = acted_notice.notice_id
          AND intent.action = 'withhold' AND intent.state = 'completed'
      ) first_withhold ON first_withhold.completed_at IS NOT NULL
    )
    SELECT
      (SELECT count(*)::integer FROM received) AS notices_received_count,
      (SELECT count(*)::integer FROM received WHERE trusted)
        AS notices_received_trusted_flagger_count,
      (SELECT coalesce(sum(items), 0)::integer FROM received) AS notified_items_count,
      (SELECT coalesce(sum(items), 0)::integer FROM received WHERE trusted)
        AS notified_items_trusted_flagger_count,
      (SELECT count(*)::integer FROM imposed) AS actions_on_law_count,
      (SELECT count(*)::integer FROM imposed WHERE trusted)
        AS actions_on_law_trusted_flagger_count,
      (SELECT count(*)::integer FROM received WHERE automated)
        AS notices_processed_by_automated_means_count,
      (SELECT count(*)::integer FROM imposed WHERE automated)
        AS restrictions_imposed_by_automated_means_count,
      (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 2)::double precision
        FROM elapsed) AS median_hours_to_action,
      (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)::numeric, 2)::double precision
        FROM elapsed WHERE trusted) AS median_hours_to_action_trusted_flagger
  `)
  const { rows } = await read<NoticeFigureRow>(query)
  const row = rows[0]
  assert(row, 500, 'Failed to count DSA copyright notices')
  const { median_hours_to_action, median_hours_to_action_trusted_flagger, ...figures } = row
  return {
    ...figures,
    actions_on_terms_count: 0,
    actions_on_terms_trusted_flagger_count: 0,
    ...(median_hours_to_action === null ? {} : { median_hours_to_action }),
    ...(median_hours_to_action_trusted_flagger === null
      ? {}
      : { median_hours_to_action_trusted_flagger }),
  }
}
