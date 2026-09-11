import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff, getModeratedCommunityIds } from './authorization.mts'
import type { UserModNote } from './config.mts'

export async function deleteUserModNote(
  currentUser: PrivateUser,
  noteId: string,
  targetUserId: string,
): Promise<void> {
  const { rows } = await read(sql`/* deleteUserModNote */
    SELECT id, target_user_id, author_user_id, community_id
    FROM user_mod_notes
    WHERE id = ${noteId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  const note = rows[0] as
    | Pick<UserModNote, 'id' | 'target_user_id' | 'author_user_id' | 'community_id'>
    | undefined
  assert(note, 404, 'Note not found')
  assert(note.target_user_id === targetUserId, 404, 'Note not found')

  const isStaff = isModerationStaff(currentUser)

  if (!isStaff) {
    if (note.community_id !== null) {
      const moderatedIds = await getModeratedCommunityIds(currentUser)
      assert(moderatedIds.includes(note.community_id), 403, 'Forbidden')
    } else {
      assert(false, 403, 'Forbidden')
    }
  }

  await write(sql`/* deleteUserModNote */
    UPDATE user_mod_notes
    SET deleted_at = now()
    WHERE id = ${noteId}
      AND deleted_at IS NULL
  `)
}
