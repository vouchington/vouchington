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

/** Starts a real persisted keyset pass immediately before the fixture's first row. */
export async function positionCopyrightOperationalCursor(
  kind: OperationalKind,
  firstId: string,
): Promise<void> {
  const tables: Record<OperationalKind, string> = {
    form_screening_attempts: 'copyright_notice_form_screening_attempts',
    action_attempts: 'copyright_notice_action_attempts',
    delivery_attempts: 'copyright_notice_delivery_attempts',
    guest_capabilities: 'copyright_notice_guest_capabilities',
    unlinked_email_intakes: 'copyright_notice_email_intakes',
    email_thread_references: 'copyright_notices',
    orphan_email_thread_tokens: 'copyright_notice_email_thread_tokens',
  }
  const { rows } = await read<{ id: string }>(
    sql`/* predecessorCopyrightOperationalCursor */ SELECT id FROM `
      .append(tables[kind])
      .append(sql` WHERE id < ${firstId} ORDER BY id DESC LIMIT 1`),
  )
  await write(sql`/* positionCopyrightOperationalCursor */
    INSERT INTO copyright_notice_operational_retention_cursors
      (kind, cursor_record_id, sweep_upper_bound_record_id)
    VALUES (${kind}::copyright_notice_operational_retention_kinds,
      ${rows[0]?.id ?? null}::uuid, NULL)
    ON CONFLICT (kind) DO UPDATE SET
      cursor_record_id = EXCLUDED.cursor_record_id,
      sweep_upper_bound_record_id = NULL`)
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
    VALUES (${intakeId}, ${priorNumber}, CURRENT_TIMESTAMP, ${priorTerminalAt}),
      (${intakeId}, ${priorNumber + 1}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id`)
  return { priorId: rows[0]!.id, latestId: rows[1]!.id }
}

export async function seedUnusedCopyrightGuestCapability(
  noticeId: string,
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1_000),
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* seedUnusedCopyrightGuestCapability */
    INSERT INTO copyright_notice_guest_capabilities
      (copyright_notice_id, token_hash, expires_at)
    VALUES (${noticeId}, ${`test-guest-${randomUUID()}`}, ${expiresAt})
    RETURNING id`)
  return rows[0]!.id
}

export async function seedCopyrightGuestCapabilitySubmission(
  noticeId: string,
  capabilityId: string,
): Promise<void> {
  await write(sql`/* seedCopyrightGuestCapabilitySubmission */
    INSERT INTO copyright_notice_submissions
      (copyright_notice_id, kind, received_at, source_kind, body_ciphertext,
       copyright_notice_guest_capability_id)
    VALUES (${noticeId}, 'supplement', CURRENT_TIMESTAMP, 'guest_form', 'v1:test-supplement',
      ${capabilityId})`)
}

export async function seedCopyrightGuestCapabilityLifecycle(
  noticeId: string,
  capabilityId: string,
): Promise<void> {
  await write(sql`/* seedCopyrightGuestCapabilityLifecycle */
    INSERT INTO copyright_notice_lifecycle_changes
      (copyright_notice_id, change_type, copyright_notice_guest_capability_id)
    VALUES (${noticeId}, 'guest_capability_issued', ${capabilityId})`)
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
  const tables = {
    form_screening_attempts: 'copyright_notice_form_screening_attempts',
    action_attempts: 'copyright_notice_action_attempts',
    delivery_attempts: 'copyright_notice_delivery_attempts',
    guest_capabilities: 'copyright_notice_guest_capabilities',
    email_thread_tokens: 'copyright_notice_email_thread_tokens',
  }
  const { rows } = await read<{ id: string }>(
    sql`/* readCopyrightOperationalRow */ SELECT id FROM `
      .append(tables[kind])
      .append(sql` WHERE id = ${id}`),
  )
  return rows.length > 0
}
