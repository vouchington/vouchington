import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { DELETED_USER_ID } from '@services/users/constants'
import {
  isModerationStaff,
  getModeratedCommunityIds,
  type ModeratedCommunityIdsOption,
} from './authorization.mts'
import type { CreateUserModNoteInput } from './parse.mts'
import type { UserModNote } from './config.mts'
import { recordModeratorAction } from '@services/moderator-actions'

export async function createUserModNote(
  currentUser: PrivateUser,
  input: CreateUserModNoteInput,
  options: ModeratedCommunityIdsOption = {},
): Promise<UserModNote> {
  assert(input.targetUserId !== DELETED_USER_ID, 422, 'Cannot add notes to the tombstone user')

  if (input.communityId === null) {
    assert(isModerationStaff(currentUser), 403, 'Only site staff can create global moderator notes')
  } else if (!isModerationStaff(currentUser)) {
    const moderatedIds =
      options.moderatedCommunityIds ?? (await getModeratedCommunityIds(currentUser))
    assert(moderatedIds.includes(input.communityId), 403, 'You do not moderate this community')
  }

  try {
    const { rows } = await write(sql`/* createUserModNote */
      WITH target_check AS (
        SELECT id FROM users
        WHERE id = ${input.targetUserId}
          AND deleted_at IS NULL
        LIMIT 1
      )
      , inserted AS (
        INSERT INTO user_moderator_notes (target_user_id, author_user_id, community_id, body)
        SELECT ${input.targetUserId}, ${currentUser.id}, ${input.communityId}, ${input.body}
        FROM target_check
        RETURNING id, created_at, target_user_id, author_user_id, community_id, body, deleted_at
      )
      SELECT n.*, author_profile.username AS author_username,
        author_profile.verified_display_name AS author_display_name,
        community.name AS community_name
      FROM inserted n
        LEFT JOIN view_users_public author_profile ON author_profile.id = n.author_user_id
      LEFT JOIN communities community ON community.id = n.community_id
    `)

    const note = rows[0] as UserModNote | undefined
    assert(note, 404, 'Target user not found')
    await recordModeratorAction(currentUser.id, {
      actionType: 'warn',
      communityId: input.communityId,
      targetUserId: input.targetUserId,
    })
    return note
  } catch (err) {
    if ((err as { code?: string }).code === '23503') {
      assert(false, 422, 'Community not found')
    }
    throw err
  }
}
