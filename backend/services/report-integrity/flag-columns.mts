/**
 * Column list for reading a flag out of `flag`, a table or CTE with the flag columns. The
 * reporter set is stored in `reporters`, a relation of `(flag_id, user_id)` rows;
 * `details.reporter_user_ids` is rebuilt from it so the API shape stays the same.
 */
export function flagColumns(flag: string, reporters: string): string {
  return `
  ${flag}.id,
  ${flag}.post_id,
  ${flag}.reported_user_id,
  ${flag}.hostname_id,
  ${flag}.rss_feed_item_id,
  ${flag}.flag_type,
  ${flag}.reporter_count,
  ${flag}.new_account_reporter_percent,
  ${flag}.details || jsonb_build_object('reporter_user_ids', COALESCE((
    SELECT jsonb_agg(reporter.user_id ORDER BY reporter.user_id)
    FROM ${reporters} reporter
    WHERE reporter.flag_id = ${flag}.id
  ), '[]'::jsonb)) AS details,
  ${flag}.resolved_at,
  ${flag}.resolved_by_id,
  ${flag}.resolution,
  ${flag}.created_at`
}

/** Columns for `SELECT ... FROM report_integrity_flags` and `UPDATE ... RETURNING`. */
export const FLAG_COLUMNS = flagColumns('report_integrity_flags', 'report_integrity_flag_reporters')
