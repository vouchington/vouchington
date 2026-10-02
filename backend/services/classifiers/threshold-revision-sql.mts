/**
 * Shared projection of one threshold revision with its effective bounds. Overrides are NUMERIC(5,4)
 * columns, so they are cast to float8 here instead of arriving as strings.
 */
export const THRESHOLD_REVISION_SELECT = `
  revision.id, revision.candidate_id, revision.prompt_version_id,
  revision.lower_threshold_override::float8 AS lower_threshold_override,
  revision.upper_threshold_override::float8 AS upper_threshold_override,
  COALESCE(revision.lower_threshold_override, prompt.default_lower_threshold)::float8
    AS effective_lower_threshold,
  COALESCE(revision.upper_threshold_override, prompt.default_upper_threshold)::float8
    AS effective_upper_threshold,
  (revision.deactivated_at IS NULL) AS is_active,
  revision.activated_at, revision.deactivated_at, revision.created_by_id,
  revision.deactivated_by_id`

export const THRESHOLD_REVISION_FROM = `
  classifier_candidate_thresholds revision
  JOIN classifier_prompt_versions prompt ON prompt.id = revision.prompt_version_id`

/** The page of a keyset listing is `limit` rows; one extra row only signals that more exist. */
export function pageOf<T>(rows: T[], limit: number): { results: T[]; hasNextPage: boolean } {
  return { results: rows.slice(0, limit), hasNextPage: rows.length > limit }
}

/** The smallest UUID, used as the exclusive lower bound of a first keyset page. */
export const FIRST_PAGE_UUID = '00000000-0000-0000-0000-000000000000'

/** The largest UUID, used as the exclusive upper bound of a first newest-first keyset page. */
export const FIRST_NEWEST_PAGE_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
