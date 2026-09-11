import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestSupportThreadLifecycleChange = {
  change_type: string
  changed_by_id: string | null
  assigned_at: Date | null
  assigned_to_id: string | null
  resolved_at: Date | null
  resolved_by_id: string | null
}

type InsertTestSupportThreadOptions = {
  supportContactId: string
  subject?: string
  conversationId?: string | null
}

export async function insertTestSupportThread(options: InsertTestSupportThreadOptions) {
  const { rows } = await write(sql`
    INSERT INTO support_threads (support_contact_id, subject, conversation_id)
    VALUES (
      ${options.supportContactId},
      ${options.subject ?? 'Test Support Thread'},
      ${options.conversationId ?? null}
    )
    RETURNING id
  `)
  return { id: rows[0].id as string }
}

export async function getTestSupportThreadLifecycleChanges(
  threadId: string,
): Promise<TestSupportThreadLifecycleChange[]> {
  const { rows } = await read(sql`/* getTestSupportThreadLifecycleChanges */
    SELECT change_type, changed_by_id, assigned_at, assigned_to_id, resolved_at, resolved_by_id
    FROM support_thread_lifecycle_changes
    WHERE support_thread_id = ${threadId}
    ORDER BY id ASC
  `)
  return rows as TestSupportThreadLifecycleChange[]
}

export async function resolveTestSupportThreadWhileLocked(
  threadId: string,
  resolvedById: string,
  onLocked: () => void,
  release: Promise<void>,
): Promise<void> {
  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(sql`/* resolveTestSupportThreadWhileLocked:lock */
        SELECT id
        FROM support_threads
        WHERE id = ${threadId}
        FOR UPDATE
      `)
    onLocked()
    await release
    await query(sql`/* resolveTestSupportThreadWhileLocked:resolve */
        UPDATE support_threads
        SET resolved_at = CURRENT_TIMESTAMP,
            resolved_by_id = ${resolvedById}
        WHERE id = ${threadId}
      `)
    await transaction.commit()
  }
}
