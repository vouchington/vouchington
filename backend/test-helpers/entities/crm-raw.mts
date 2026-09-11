import { read } from '@data-stores/psql'

export async function getCrmContactRaw(
  id: string,
): Promise<{ id: string; created_by_id: string } | null> {
  const { rows } = await read(
    `/* getCrmContactRaw */ SELECT id, created_by_id FROM crm_contacts WHERE id = $1`,
    [id],
  )
  return (rows[0] as { id: string; created_by_id: string } | undefined) ?? null
}

export async function getCrmNoteCreatedById(noteId: string): Promise<string | null> {
  const { rows } = await read(
    `/* getCrmNoteCreatedById */ SELECT created_by_id FROM conversation_messages WHERE id = $1 AND kind = 'note'`,
    [noteId],
  )
  return (rows[0] as { created_by_id: string | null } | undefined)?.created_by_id ?? null
}
