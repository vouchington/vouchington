import { write } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export async function assignSupportThread(
  threadId: string,
  assignedToId: string,
  changedById = assignedToId,
): Promise<void> {
  const result = await write(sql`/* assignSupportThread */
    WITH thread_snapshot AS (
      SELECT id, resolved_at, resolved_by_id
      FROM support_threads
      WHERE id = ${threadId}
        AND resolved_at IS NULL
      FOR UPDATE
    ),
    inserted_change AS (
      INSERT INTO support_thread_lifecycle_changes (
        support_thread_id,
        change_type,
        changed_by_id,
        assigned_at,
        assigned_to_id,
        resolved_at,
        resolved_by_id
      )
      SELECT
        id,
        'assign',
        ${changedById},
        CURRENT_TIMESTAMP,
        ${assignedToId},
        resolved_at,
        resolved_by_id
      FROM thread_snapshot
      RETURNING id, support_thread_id, assigned_at, assigned_to_id, resolved_at, resolved_by_id
    )
    UPDATE support_threads
    SET assigned_at = inserted_change.assigned_at,
        assigned_to_id = inserted_change.assigned_to_id,
        resolved_at = inserted_change.resolved_at,
        resolved_by_id = inserted_change.resolved_by_id,
        latest_lifecycle_change_id = inserted_change.id,
        updated_at = CURRENT_TIMESTAMP
    FROM inserted_change
    WHERE support_threads.id = inserted_change.support_thread_id
  `)
  assert(result.rowCount === 1, 409, 'Reopen this thread before assigning it')
}

export async function resolveSupportThread(threadId: string, resolvedById: string): Promise<void> {
  await write(sql`/* resolveSupportThread */
    WITH thread_snapshot AS (
      SELECT id, assigned_at, assigned_to_id
      FROM support_threads
      WHERE id = ${threadId}
      FOR UPDATE
    ),
    inserted_change AS (
      INSERT INTO support_thread_lifecycle_changes (
        support_thread_id,
        change_type,
        changed_by_id,
        assigned_at,
        assigned_to_id,
        resolved_at,
        resolved_by_id
      )
      SELECT
        id,
        'resolve',
        ${resolvedById},
        assigned_at,
        assigned_to_id,
        CURRENT_TIMESTAMP,
        ${resolvedById}
      FROM thread_snapshot
      RETURNING id, support_thread_id, assigned_at, assigned_to_id, resolved_at, resolved_by_id
    )
    UPDATE support_threads
    SET assigned_at = inserted_change.assigned_at,
        assigned_to_id = inserted_change.assigned_to_id,
        resolved_at = inserted_change.resolved_at,
        resolved_by_id = inserted_change.resolved_by_id,
        latest_lifecycle_change_id = inserted_change.id,
        updated_at = CURRENT_TIMESTAMP
    FROM inserted_change
    WHERE support_threads.id = inserted_change.support_thread_id
  `)
}

export async function reopenSupportThread(
  threadId: string,
  changedById?: string | null,
): Promise<void> {
  await write(sql`/* reopenSupportThread */
    WITH thread_snapshot AS (
      SELECT id
      FROM support_threads
      WHERE id = ${threadId}
        AND resolved_at IS NOT NULL
      FOR UPDATE
    ),
    inserted_change AS (
      INSERT INTO support_thread_lifecycle_changes (
        support_thread_id,
        change_type,
        changed_by_id,
        assigned_at,
        assigned_to_id,
        resolved_at,
        resolved_by_id
      )
      SELECT
        id,
        'reopen',
        ${changedById ?? null},
        NULL,
        NULL,
        NULL,
        NULL
      FROM thread_snapshot
      RETURNING id, support_thread_id, assigned_at, assigned_to_id, resolved_at, resolved_by_id
    )
    UPDATE support_threads
    SET assigned_at = inserted_change.assigned_at,
        assigned_to_id = inserted_change.assigned_to_id,
        resolved_at = inserted_change.resolved_at,
        resolved_by_id = inserted_change.resolved_by_id,
        latest_lifecycle_change_id = inserted_change.id,
        updated_at = CURRENT_TIMESTAMP
    FROM inserted_change
    WHERE support_threads.id = inserted_change.support_thread_id
  `)
}
