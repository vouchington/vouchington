import { read } from '@data-stores/psql'

export async function getLifecycleConstraintNames(tableNames: string[]): Promise<string[]> {
  const { rows } = await read<{ qualified_name: string }>(
    `/* getLifecycleConstraints */
      SELECT table_definition.relname || '.' || constraint_definition.conname AS qualified_name
      FROM pg_constraint constraint_definition
      JOIN pg_class table_definition
        ON table_definition.oid = constraint_definition.conrelid
      JOIN pg_namespace namespace
        ON namespace.oid = table_definition.relnamespace
      WHERE namespace.nspname = 'public'
        AND constraint_definition.contype = 'c'
        AND table_definition.relname = ANY($1)
      ORDER BY qualified_name`,
    [tableNames],
  )
  return rows.map(row => row.qualified_name)
}

export type TerminalLifecycleGuard = {
  tableName: string
  triggerDefinition: string
}

export async function getTerminalLifecycleGuards(
  tableNames: string[],
): Promise<TerminalLifecycleGuard[]> {
  const { rows } = await read<{ table_name: string; trigger_definition: string }>(
    `/* getTerminalLifecycleGuardTriggers */
      SELECT
        table_definition.relname AS table_name,
        pg_get_triggerdef(trigger_definition.oid) AS trigger_definition
      FROM pg_trigger trigger_definition
      JOIN pg_class table_definition
        ON table_definition.oid = trigger_definition.tgrelid
      JOIN pg_namespace namespace
        ON namespace.oid = table_definition.relnamespace
      WHERE namespace.nspname = 'public'
        AND NOT trigger_definition.tgisinternal
        AND trigger_definition.tgname LIKE 'trigger_%_guard_terminal_lifecycle'
        AND table_definition.relname = ANY($1)
      ORDER BY table_name`,
    [tableNames],
  )
  return rows.map(row => ({
    tableName: row.table_name,
    triggerDefinition: row.trigger_definition,
  }))
}

export async function getTerminalLifecycleGuardFunctionDefinition(): Promise<string> {
  const { rows } = await read<{ function_definition: string }>(
    `/* getTerminalLifecycleGuardFunction */
      SELECT pg_get_functiondef(oid) AS function_definition
      FROM pg_proc
      WHERE pronamespace = 'public'::regnamespace
        AND proname = 'fn_guard_terminal_lifecycle'`,
  )
  if (rows.length !== 1)
    throw new Error(`Expected one lifecycle guard function, got ${rows.length}`)
  return rows[0]!.function_definition
}

async function getConstraintDefinition(table: string, constraint: string): Promise<string> {
  const { rows } = await read<{ constraint_definition: string }>(
    `/* getLifecycleConstraintDefinition */
      SELECT pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conrelid = $1::regclass
        AND conname = $2`,
    [table, constraint],
  )
  if (rows.length !== 1) {
    throw new Error(`Expected one ${table}.${constraint} constraint, got ${rows.length}`)
  }
  return rows[0]!.constraint_definition
}

export async function getFollowerDistributionAudienceConstraint(): Promise<string> {
  return getConstraintDefinition(
    'follower_distributions',
    'chk_follower_distributions__audience_selection',
  )
}

export async function getModerationTrainingTargetConstraint(): Promise<string> {
  return getConstraintDefinition(
    'moderation_training_feedbacks',
    'chk_moderation_training_feedbacks__targets',
  )
}
