import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ActiveClassifierConfiguration } from './types.mts'

type ActiveClassifierConfigurationRow = {
  classifier_id: string
  primitive: ActiveClassifierConfiguration['primitive']
  candidate_kind: ActiveClassifierConfiguration['candidateKind']
  prompt_version_id: string
  prompt: string
  model_name: string
  model_provider: ActiveClassifierConfiguration['modelProvider']
  default_lower_threshold: number
  default_upper_threshold: number
}

export async function getActiveClassifierConfigurationFromPrimary(
  classifierId: string,
): Promise<ActiveClassifierConfiguration | null> {
  const { rows } = await write<ActiveClassifierConfigurationRow>(sql`
    /* getActiveClassifierConfigurationFromPrimary */
    SELECT
      classifier.id AS classifier_id,
      classifier.primitive,
      classifier.candidate_kind,
      prompt.id AS prompt_version_id,
      prompt.prompt,
      prompt.model_name,
      prompt.model_provider,
      prompt.default_lower_threshold::float8 AS default_lower_threshold,
      prompt.default_upper_threshold::float8 AS default_upper_threshold
    FROM classifiers classifier
    JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
    WHERE classifier.id = ${classifierId}
      AND classifier.activated_at IS NOT NULL
      AND classifier.deactivated_at IS NULL
      AND classifier.deleted_at IS NULL
      AND prompt.activated_at IS NOT NULL
      AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
  `)
  const row = rows[0]
  if (!row) return null
  return activeClassifierConfigurationFromRow(row)
}

/**
 * Same lookup as `getActiveClassifierConfigurationFromPrimary`, keyed by the
 * classifier's stable `slug` instead of its UUID. Callers that only know the
 * classifier by a compile-time-constant name (for example a worker resolving
 * the global `tagging` classifier) resolve the UUID here rather than hardcode
 * or cache it, so a slug always reflects whichever configuration is
 * currently active.
 */
export async function getActiveClassifierConfigurationBySlugFromPrimary(
  slug: string,
): Promise<ActiveClassifierConfiguration | null> {
  const { rows } = await write<ActiveClassifierConfigurationRow>(sql`
    /* getActiveClassifierConfigurationBySlugFromPrimary */
    SELECT
      classifier.id AS classifier_id,
      classifier.primitive,
      classifier.candidate_kind,
      prompt.id AS prompt_version_id,
      prompt.prompt,
      prompt.model_name,
      prompt.model_provider,
      prompt.default_lower_threshold::float8 AS default_lower_threshold,
      prompt.default_upper_threshold::float8 AS default_upper_threshold
    FROM classifiers classifier
    JOIN classifier_prompt_versions prompt ON prompt.classifier_id = classifier.id
    WHERE classifier.slug = ${slug}
      AND classifier.activated_at IS NOT NULL
      AND classifier.deactivated_at IS NULL
      AND classifier.deleted_at IS NULL
      AND prompt.activated_at IS NOT NULL
      AND prompt.deactivated_at IS NULL
      AND prompt.deleted_at IS NULL
  `)
  const row = rows[0]
  if (!row) return null
  return activeClassifierConfigurationFromRow(row)
}

function activeClassifierConfigurationFromRow(
  row: ActiveClassifierConfigurationRow,
): ActiveClassifierConfiguration {
  return {
    classifierId: row.classifier_id,
    primitive: row.primitive,
    candidateKind: row.candidate_kind,
    promptVersionId: row.prompt_version_id,
    prompt: row.prompt,
    modelName: row.model_name,
    modelProvider: row.model_provider,
    defaultThresholds: {
      lower: row.default_lower_threshold,
      upper: row.default_upper_threshold,
    },
  }
}
