import {
  COPYRIGHT_RETENTION_FAMILIES,
  type CopyrightRetentionScopes,
  type CopyrightRetentionFamily,
} from '../services/data-retention/cleanup-copyright-operational.mts'
import {
  createCopyrightOperationalCursor,
  type CopyrightOperationalScope,
} from '../services/copyright-notices/operational-retention-cursor.mts'
import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type OperationalKind =
  | 'form_screening_attempts'
  | 'action_attempts'
  | 'delivery_attempts'
  | 'guest_capabilities'
  | 'unlinked_email_intakes'
  | 'email_thread_references'
  | 'orphan_email_thread_tokens'

function operationalTable(kind: OperationalKind | 'email_thread_tokens'): string {
  switch (kind) {
    case 'form_screening_attempts':
      return 'copyright_notice_form_screening_attempts'
    case 'action_attempts':
      return 'copyright_notice_action_attempts'
    case 'delivery_attempts':
      return 'copyright_notice_delivery_attempts'
    case 'guest_capabilities':
      return 'copyright_notice_guest_capabilities'
    case 'unlinked_email_intakes':
      return 'copyright_notice_email_intakes'
    case 'email_thread_references':
      return 'copyright_notices'
    case 'orphan_email_thread_tokens':
    case 'email_thread_tokens':
      return 'copyright_notice_email_thread_tokens'
    default:
      throw new Error(`Unknown copyright operational kind: ${String(kind)}`)
  }
}

/** An explicit owned set; pagination lives only in this caller's progress DTO. */
export function createCopyrightOperationalScope(
  recordIds: readonly string[],
): CopyrightOperationalScope {
  return { recordIds: [...recordIds], cursor: createCopyrightOperationalCursor() }
}

/** Every cleanup family gets a distinct owned pass, including empty families. */
export function createCopyrightRetentionScopes(
  records: Partial<Record<CopyrightRetentionFamily, readonly string[]>> = {},
): CopyrightRetentionScopes {
  return Object.fromEntries(
    COPYRIGHT_RETENTION_FAMILIES.map(family => [
      family,
      createCopyrightOperationalScope(records[family] ?? []),
    ]),
  )
}

/** Observe only this pass's committed thread progress. */
export function readCopyrightThreadOperationalCursor(scope: CopyrightOperationalScope): Promise<{
  cursor_record_id: string | null
  cursor_child_id: string | null
  cursor_phase: string | null
  cursor_blocker_phase: string | null
}> {
  const { cursor_record_id, cursor_child_id, cursor_phase, cursor_blocker_phase } = scope.cursor
  return Promise.resolve({ cursor_record_id, cursor_child_id, cursor_phase, cursor_blocker_phase })
}

export async function seedCopyrightExecutionAttemptPair(
  kind: 'action' | 'delivery',
  workItemId: string,
  options: { priorTerminalAt?: Date; latestTerminalAt?: Date } = {},
): Promise<{ priorId: string; latestId: string }> {
  const attemptTable =
    kind === 'action' ? 'copyright_notice_action_attempts' : 'copyright_notice_delivery_attempts'
  const resultTable =
    kind === 'action'
      ? 'copyright_notice_action_attempt_results'
      : 'copyright_notice_delivery_attempt_results'
  const resultColumn = kind === 'action' ? 'completed_at' : 'sent_at'
  const { rows: numbers } = await read<{ next_number: number }>(
    sql`/* nextTestCopyrightExecutionAttemptNumber */ SELECT
      COALESCE(MAX(attempt_number), 0) + 1 AS next_number FROM `
      .append(attemptTable)
      .append(sql` WHERE work_item_id = ${workItemId}`),
  )
  const priorNumber = numbers[0]!.next_number
  const { rows } = await write<{ id: string }>(
    sql`/* seedCopyrightExecutionAttemptPair */ INSERT INTO `.append(attemptTable)
      .append(sql` (work_item_id, generation, attempt_number, lease_token, started_at)
        VALUES (${workItemId}, 1, ${priorNumber}, ${randomUUID()}, CURRENT_TIMESTAMP),
          (${workItemId}, 1, ${priorNumber + 1}, ${randomUUID()}, CURRENT_TIMESTAMP)
        RETURNING id`),
  )
  const [priorId, latestId] = rows.map(row => row.id)
  for (const [index, id] of [priorId, latestId].entries()) {
    const terminalAt =
      index === 0
        ? (options.priorTerminalAt ?? new Date())
        : (options.latestTerminalAt ?? new Date())
    await write(
      sql`/* seedCopyrightExecutionAttemptResult */ INSERT INTO `
        .append(resultTable)
        .append(sql` (attempt_id, `)
        .append(resultColumn)
        .append(sql`) VALUES (${id}, ${terminalAt})`),
    )
  }
  return { priorId: priorId!, latestId: latestId! }
}

export async function seedCopyrightFormScreeningAttemptPair(
  intakeId: string,
  options: { priorTerminalAt?: Date } = {},
): Promise<{
  priorId: string
  latestId: string
}> {
  const { rows: numbers } = await read<{
    next_number: number
  }>(sql`/* nextTestCopyrightScreeningNumber */
    SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_number
    FROM copyright_notice_form_screening_attempts
    WHERE copyright_notice_form_intake_id = ${intakeId}`)
  const priorNumber = numbers[0]!.next_number
  const priorTerminalAt = options.priorTerminalAt ?? new Date()
  const { rows } = await write<{ id: string }>(sql`/* seedCopyrightFormScreeningAttemptPair */
    INSERT INTO copyright_notice_form_screening_attempts
      (copyright_notice_form_intake_id, attempt_number, started_at, failed_at)
    VALUES (${intakeId}, ${priorNumber}, LEAST(CURRENT_TIMESTAMP, ${priorTerminalAt}), ${priorTerminalAt}),
      (${intakeId}, ${priorNumber + 1}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id`)
  return { priorId: rows[0]!.id, latestId: rows[1]!.id }
}

export async function readCopyrightExecutionResult(
  kind: 'action' | 'delivery',
  attemptId: string,
): Promise<boolean> {
  const table =
    kind === 'action'
      ? 'copyright_notice_action_attempt_results'
      : 'copyright_notice_delivery_attempt_results'
  const { rows } = await read<{ attempt_id: string }>(
    sql`/* readCopyrightExecutionResult */ SELECT attempt_id FROM `
      .append(table)
      .append(sql` WHERE attempt_id = ${attemptId}`),
  )
  return rows.length > 0
}

export async function readCopyrightOperationalRow(
  kind:
    | 'form_screening_attempts'
    | 'action_attempts'
    | 'delivery_attempts'
    | 'guest_capabilities'
    | 'email_thread_tokens',
  id: string,
): Promise<boolean> {
  const { rows } = await read<{ id: string }>(
    sql`/* readCopyrightOperationalRow */ SELECT id FROM `
      .append(operationalTable(kind))
      .append(sql` WHERE id = ${id}`),
  )
  return rows.length > 0
}
