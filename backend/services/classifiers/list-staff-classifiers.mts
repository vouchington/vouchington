import { write } from '@data-stores/psql'
import type { ClassifierModelProvider } from '@voucha/types'
import { FIRST_PAGE_UUID, pageOf } from './threshold-revision-sql.mts'
import type { StaffClassifierSummary } from './threshold-management-types.mts'

type StaffClassifierRow = Omit<StaffClassifierSummary, 'active_prompt_version'> & {
  prompt_version_id: string | null
  model_name: string | null
  model_provider: ClassifierModelProvider | null
  default_lower_threshold: number | null
  default_upper_threshold: number | null
  prompt_version_activated_at: Date | null
}

/**
 * Staff view of every non-deleted classifier with its active prompt version's defaults. Read from
 * the primary so a staff member sees a change they just made.
 */
export async function listStaffClassifiers(options: { limit: number; afterId?: string }) {
  const { rows } = await write<StaffClassifierRow>(
    `/* listStaffClassifiers */
    SELECT classifier.id, classifier.slug, classifier.primitive, classifier.candidate_kind,
      classifier.activated_at, classifier.deactivated_at,
      prompt.id AS prompt_version_id, prompt.model_name, prompt.model_provider,
      prompt.default_lower_threshold::float8 AS default_lower_threshold,
      prompt.default_upper_threshold::float8 AS default_upper_threshold,
      prompt.activated_at AS prompt_version_activated_at
    FROM classifiers classifier
    LEFT JOIN classifier_prompt_versions prompt
      ON prompt.classifier_id = classifier.id
      AND prompt.activated_at IS NOT NULL
      AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
    WHERE classifier.deleted_at IS NULL AND classifier.id > $1::uuid
    ORDER BY classifier.id
    LIMIT $2`,
    [options.afterId ?? FIRST_PAGE_UUID, options.limit + 1],
  )
  const page = pageOf(rows, options.limit)
  return {
    hasNextPage: page.hasNextPage,
    results: page.results.map((row): StaffClassifierSummary => ({
      id: row.id,
      slug: row.slug,
      primitive: row.primitive,
      candidate_kind: row.candidate_kind,
      activated_at: row.activated_at,
      deactivated_at: row.deactivated_at,
      active_prompt_version:
        row.prompt_version_id === null
          ? null
          : {
              id: row.prompt_version_id,
              model_name: row.model_name!,
              model_provider: row.model_provider!,
              default_lower_threshold: row.default_lower_threshold!,
              default_upper_threshold: row.default_upper_threshold!,
              activated_at: row.prompt_version_activated_at,
            },
    })),
  }
}
