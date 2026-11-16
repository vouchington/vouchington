import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'

/** Per-case names for the shared run-gated AI draft save. All strings are repo-owned constants. */
export interface RunGatedDraftSpec {
  /** Query annotation, without comment markers. */
  name: string
  table: string
  lifecycleTable: string
  runsTable: string
  /** Column holding the parent id in both the lifecycle and runs tables. */
  parentColumn: string
  /** Parent column that must already name the saving run, or null when any run row may save. */
  requestedRunColumn: string | null
  /** Whether the saving run must still be active (nothing finished or expired it). */
  requireActiveRun: boolean
  /** Whether saving a draft withdraws an earlier approval. */
  clearApproval: boolean
  /** Column list the saved parent row returns. */
  returning: string
  notFoundMessage: string
}

export interface RunGatedDraftInput {
  parentId: string
  runId: string
  recommendedAction: string
  aiPublicResponse: string
  aiInternalResponse: string
  model: string
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/

function identifier(value: string): string {
  assert(IDENTIFIER.test(value), 500, `Unsafe SQL identifier: ${value}`)
  return value
}

const ACTIVE_RUN = sql`AND run.completed_at IS NULL AND run.failed_at IS NULL AND run.expired_at IS NULL`

/**
 * Saves the draft and completes its run in one statement. The run row is locked because it is
 * written, so a delayed failure marker either lands first or finds the run complete; no other
 * row is locked. Returns null when the run no longer applies, and 404s when the parent is gone.
 */
export async function saveRunGatedAiDraft<Row extends object>(
  spec: RunGatedDraftSpec,
  input: RunGatedDraftInput,
): Promise<Row | null> {
  const now = new Date()
  const [table, lifecycleTable, runsTable, parent] = [
    spec.table,
    spec.lifecycleTable,
    spec.runsTable,
    spec.parentColumn,
  ].map(identifier)
  const statement = sql`/* `
    .append(spec.name)
    .append(sql` */
    WITH lifecycle_change_id AS (
      SELECT uuidv7() AS id
    ),
    updated AS (
      UPDATE `)
    .append(table!)
    .append(
      sql`
      SET recommended_action = ${input.recommendedAction},
          ai_public_response = ${input.aiPublicResponse},
          ai_internal_response = ${input.aiInternalResponse},
          model = ${input.model},
          ai_drafted_at = ${now},
          ai_draft_run_id = ${input.runId}::uuid,
          public_response = ${input.aiPublicResponse},
          drafted_at = COALESCE(drafted_at, ${now}),
          `,
    )
    .append(spec.clearApproval ? 'approved_at = NULL, approved_by_id = NULL,' : '')
    .append(
      sql`
          latest_lifecycle_change_id = (SELECT id FROM lifecycle_change_id)
      WHERE id = ${input.parentId}
        `,
    )
  if (spec.requestedRunColumn)
    statement
      .append(`AND ${identifier(spec.requestedRunColumn)} = `)
      .append(sql`${input.runId}::uuid`)
  statement
    .append(
      `
        AND approved_at IS NULL
        AND sent_at IS NULL
        AND resolved_at IS NULL
        AND EXISTS (
          SELECT 1 FROM ${runsTable} run
          WHERE run.id = `,
    )
    .append(sql`${input.runId}::uuid`)
    .append(` AND run.${parent} = ${table}.id `)
    .append(spec.requireActiveRun ? ACTIVE_RUN : '')
    .append(
      `
          FOR UPDATE
        )
      RETURNING
        ${spec.returning}
    ),
    inserted_change AS (
      INSERT INTO ${lifecycleTable} (id, ${parent}, change_type, changed_by_id, metadata)
      SELECT lifecycle_change_id.id, updated.id, 'ai_draft', NULL,
        `,
    )
    .append(
      sql`${JSON.stringify({ model: input.model, recommended_action: input.recommendedAction, run_id: input.runId })}::jsonb`,
    )
    .append(
      `
      FROM updated
      CROSS JOIN lifecycle_change_id
    ),
    completed_run AS (
      UPDATE ${runsTable} run
      SET completed_at = `,
    )
    .append(sql`${now}, ai_drafted_at = ${now}`)
    .append(
      `,
          latest_lifecycle_change_id = updated.latest_lifecycle_change_id
      FROM updated
      WHERE run.id = `,
    )
    .append(sql`${input.runId}::uuid`).append(` AND run.${parent} = updated.id
      RETURNING run.id
    )
    SELECT * FROM updated
  `)
  const { rows } = await write<Row>(statement)
  if (rows[0]) return rows[0]
  const { rows: current } = await write<{ id: string }>(
    sql`/* `
      .append(`${spec.name}:checkParent`)
      .append(sql` */ SELECT id FROM `)
      .append(table!)
      .append(sql` WHERE id = ${input.parentId}`),
  )
  assert(current[0], 404, spec.notFoundMessage)
  return null
}
