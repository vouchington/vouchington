const FLAG_BASE_COLUMN_NAMES = [
  'id',
  'post_id',
  'reported_user_id',
  'hostname_id',
  'rss_feed_item_id',
  'flag_type',
  'reporter_count',
  'new_account_reporter_percent',
  'details',
  'resolved_at',
  'resolved_by_id',
  'resolution',
  'created_at',
] as const

/** Unqualified columns for `INSERT INTO report_integrity_flags ... RETURNING`. */
export const FLAG_RETURNING_COLUMNS = FLAG_BASE_COLUMN_NAMES.join(', ')

/**
 * Column list for reading a flag out of `flag`, a table or CTE with the flag columns. The
 * reporter set is stored in `reporters`, a relation of `(flag_id, user_id)` rows;
 * `details.reporter_user_ids` is rebuilt from it for detail reads and write results.
 */
export function flagColumns(flag: string, reporters: string): string {
  return flagSummaryColumns(
    flag,
    `${flag}.details || jsonb_build_object('reporter_user_ids', COALESCE((
    SELECT jsonb_agg(reporter.user_id ORDER BY reporter.user_id)
    FROM ${reporters} reporter
    WHERE reporter.flag_id = ${flag}.id
  ), '[]'::jsonb))`,
  )
}

/** List-row columns: `details` as stored, without the reporter id set (`reporter_count` stays). */
export const FLAG_SUMMARY_COLUMNS_WITH_HOSTNAME = `${flagSummaryColumns(
  'report_integrity_flags',
  'report_integrity_flags.details',
)},
  (SELECT hostname FROM url_hostnames WHERE id = report_integrity_flags.hostname_id) AS hostname`

function flagSummaryColumns(flag: string, details: string): string {
  return `\n  ${FLAG_BASE_COLUMN_NAMES.map(column =>
    column === 'details' ? `${details} AS details` : `${flag}.${column}`,
  ).join(',\n  ')}`
}

/** Columns for `SELECT ... FROM report_integrity_flags` and `UPDATE ... RETURNING`. */
export const FLAG_COLUMNS = flagColumns('report_integrity_flags', 'report_integrity_flag_reporters')

export const FLAG_COLUMNS_WITH_HOSTNAME = `${FLAG_COLUMNS},
  (SELECT hostname FROM url_hostnames WHERE id = report_integrity_flags.hostname_id) AS hostname`
