import assert from 'http-assert'
import { getPrivateUserByAny } from '@services/users/get'
import {
  getUserModerationContext,
  listUserModNotes,
  createUserModNote,
  parseCreateUserModNoteInput,
} from '@services/user-mod-notes'
import { createAdminTool, adminInput, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

async function requireTargetUser(id: string) {
  const user = await getPrivateUserByAny(id)
  assert(user, 404, 'User not found')
  return user
}
export const adminUserContextTools = [
  createAdminTool<{ userId: string }>({
    name: 'get_user_moderation_context',
    description: 'Read staff moderation context and notes for a user.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/users/:userId/moderation-context' },
    parameters: adminInput({ userId: UUID_INPUT }, ['userId']),
    outputSchema: adminRouteOutputSchema({
      method: 'GET',
      path: '/api/v1/users/:userId/moderation-context',
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (user, { userId }) => {
      const target = await requireTargetUser(userId)
      const [context, { notes, hasNextPage }] = await Promise.all([
        getUserModerationContext(user, target, true),
        listUserModNotes(user, userId),
      ])
      return { context, notes, page_info: { has_next_page: hasNextPage } }
    },
  }),
  createAdminTool<{ userId: string; after?: string; limit?: number }>({
    name: 'list_user_moderator_notes',
    description: 'Page staff notes for a user.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/users/:userId/mod-notes' },
    parameters: adminInput(
      {
        userId: UUID_INPUT,
        after: UUID_INPUT,
        limit: { type: 'integer', minimum: 1, maximum: 100 },
      },
      ['userId'],
    ),
    outputSchema: adminRouteOutputSchema({
      method: 'GET',
      path: '/api/v1/users/:userId/mod-notes',
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (user, args) => {
      await requireTargetUser(args.userId)
      const { notes, hasNextPage } = await listUserModNotes(user, args.userId, {
        limit: args.limit,
        beforeId: args.after,
      })
      return { notes, page_info: { has_next_page: hasNextPage } }
    },
  }),
  createAdminTool<{ userId: string; body: string; community_id?: string }>({
    name: 'add_user_mod_note',
    description: 'Add an audited moderator note to a user.',
    scope: 'moderation:write',
    api: { method: 'POST', path: '/api/v1/users/:userId/mod-notes' },
    parameters: adminInput({ userId: UUID_INPUT, body: TEXT_INPUT, community_id: UUID_INPUT }, [
      'userId',
      'body',
    ]),
    outputSchema: adminRouteOutputSchema({
      method: 'POST',
      path: '/api/v1/users/:userId/mod-notes',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => ({
      note: await createUserModNote(
        user,
        parseCreateUserModNoteInput({
          targetUserId: args.userId,
          body: args.body,
          communityId: args.community_id,
        }),
      ),
    }),
  }),
]
