import type { TransactionQuery } from '@data-stores/psql/types'
import sql, { type SQLStatement } from 'sql-template-strings'

/** Capture attribution at filing, independently of the queue-priority switch. */
export async function recordCopyrightTrustedFlaggerMatch(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<void> {
  await transaction(sql`/* recordCopyrightTrustedFlaggerMatch */
    INSERT INTO copyright_trusted_flagger_matches (
      copyright_notice_id, copyright_trusted_flagger_id
    )
    SELECT notice.id, flagger.id
    FROM copyright_notices notice
    JOIN copyright_trusted_flaggers flagger ON flagger.user_id = notice.claimant_user_id
    LEFT JOIN LATERAL (
      SELECT change.change_type
      FROM copyright_trusted_flagger_changes change
      WHERE change.copyright_trusted_flagger_id = flagger.id
        AND change.created_at <= notice.received_at
      ORDER BY change.id DESC LIMIT 1
    ) latest_change ON true
    WHERE notice.id = ${noticeId} AND notice.jurisdiction = 'eu_dsa'
      AND notice.claimant_user_id IS NOT NULL
      AND flagger.created_at <= notice.received_at
      AND flagger.awarded_at <= (notice.received_at AT TIME ZONE 'UTC')::date
      AND (latest_change.change_type IS NULL OR latest_change.change_type = 'reinstated')
    ORDER BY CASE WHEN flagger.area_of_expertise = 'intellectual_property' THEN 0 ELSE 1 END,
      flagger.created_at DESC, flagger.id DESC
    LIMIT 1
    ON CONFLICT (copyright_notice_id) DO NOTHING
  `)
}

/** The single shared definition used by queue priority, reporting, and source attribution. */
export function inAreaTrustedFlaggerMatchSql(noticeId: SQLStatement): SQLStatement {
  return sql`EXISTS (
    SELECT 1 FROM copyright_trusted_flagger_matches trusted_match
    JOIN copyright_trusted_flaggers trusted_flagger
      ON trusted_flagger.id = trusted_match.copyright_trusted_flagger_id
    WHERE trusted_match.copyright_notice_id = `.append(noticeId).append(sql`
      AND trusted_flagger.area_of_expertise = 'intellectual_property'
  )`)
}
