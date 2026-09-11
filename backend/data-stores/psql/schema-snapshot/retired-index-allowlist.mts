export const RETIRED_INDEX_ALLOWLIST_FILE =
  'backend/data-stores/psql/schema-snapshot/retired-index-allowlist.mts'

/**
 * Retired index names accepted as a rename with no acknowledging drop migration — for genuine
 * false positives (e.g. a PRIMARY KEY/UNIQUE constraint reshuffle renders as a rename of its
 * backing index, which cannot carry a `DROP INDEX` of its own). Empty by default: every real
 * rename must ship the `DROP INDEX [CONCURRENTLY] IF EXISTS <old>` migration instead of an
 * allowlist entry. See check-index-renames.mts and
 * ../../../../docs/development/postgres-schema-rules.md.
 *
 * Entries that stop matching a detected rename are reported as stale — see
 * unacknowledgedRenames() in index-rename-acknowledge.mts.
 */
export const RETIRED_INDEX_ALLOWLIST: ReadonlySet<string> = new Set()
