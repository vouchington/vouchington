import createError from 'http-errors'
import type { TransactionQuery } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { getPrivateUserByAny } from '@services/users/get'
import {
  loadCommunityWithViewer,
  type LoadedCommunity,
} from '@services/communities/load-with-viewer'
import { getCommunityMember } from '@services/communities/members/get'
import { isModerationStaff } from '@services/users'
import { createConversationMessage } from '@services/messaging/create'
import { admitConversationParticipants } from '@services/messaging/participant-admission'
import sql from 'sql-template-strings'
import {
  currentUserCanOpenModmailThread,
  currentUserCanViewModmailThread,
} from './authorization.mts'
import { openModmailThread } from './threads.mts'
import { getModmailThread } from './threads-get.mts'

/** Authorize before parsing the REST body; MCP uses the same membership policy. */
export async function loadModmailOpeningAccess(currentUser: PrivateUser, idOrSlug: string) {
  assertNotSuspended(currentUser)
  const loaded = await loadCommunityWithViewer(idOrSlug, currentUser.id)
  if (!currentUserCanOpenModmailThread(currentUser, loaded.community, loaded.membership)) {
    throw createError(403, 'You must be a community member to open a modmail thread')
  }
  return loaded
}

export async function openAuthorizedModmailThread(
  currentUser: PrivateUser,
  { community, membership }: LoadedCommunity,
  subjectUserId: unknown,
) {
  const isMod = currentUserCanViewModmailThread(currentUser, community, membership)
  const subjectId = isMod && typeof subjectUserId === 'string' ? subjectUserId : currentUser.id
  if (isMod && subjectId !== currentUser.id) {
    const subject = await getPrivateUserByAny(subjectId)
    if (!subject) throw createError(404, 'Subject user not found')
    const subjectMembership = await getCommunityMember(community.id, subjectId)
    if (!subjectMembership || subjectMembership.removed_at) {
      throw createError(422, 'Subject user is not an active community member')
    }
  }
  return openModmailThread(currentUser.id, community.id, subjectId)
}

/** Preserve subject access after membership removal and staff access without membership. */
export async function loadModmailReplyAccess(
  currentUser: PrivateUser,
  idOrSlug: string,
  conversationId: string,
) {
  assertNotSuspended(currentUser)
  const [{ community, membership }, thread] = await Promise.all([
    loadCommunityWithViewer(idOrSlug, currentUser.id),
    getModmailThread(conversationId),
  ])
  if (!thread || thread.community_id !== community.id) {
    throw createError(404, 'Modmail thread not found')
  }
  const isMod = currentUserCanViewModmailThread(currentUser, community, membership)
  if (!isMod && thread.subject_user_id !== currentUser.id) throw createError(403, 'Access denied')
  if (thread.resolved_at) {
    throw createError(409, 'Thread is resolved; resolve must be undone before replying')
  }
  return { thread, isMod }
}

/** The first staff reply admits its author only when the message commits. */
export async function replyToModmailThread(
  currentUser: PrivateUser,
  access: Awaited<ReturnType<typeof loadModmailReplyAccess>>,
  provenance: Parameters<typeof createConversationMessage>[1],
  text: string,
) {
  return createConversationMessage(currentUser.id, provenance, access.thread.id, text, {
    ...(access.isMod
      ? {
          beforeInsert: async (query: TransactionQuery) => {
            const { rows } = await query<{
              id: string
              is_authorized: boolean
            }>(sql`/* replyToModmailThread:current */
              SELECT c.id, (
                ${isModerationStaff(currentUser)} OR EXISTS (
                  SELECT 1 FROM community_members cm
                  WHERE cm.community_id = c.community_id
                    AND cm.user_id = ${currentUser.id}
                    AND cm.role IN ('owner', 'moderator')
                    AND cm.removed_at IS NULL
                )
              ) AS is_authorized
              FROM conversations c
              WHERE c.id = ${access.thread.id}
                AND c.channel_type = 'modmail'
                AND c.community_id = ${access.thread.community_id}
                AND c.resolved_at IS NULL AND c.deleted_at IS NULL
              LIMIT 1`)
            if (!rows[0]) throw createError(409, 'Modmail thread is no longer open')
            if (!rows[0].is_authorized) throw createError(403, 'Access denied')
            await admitConversationParticipants(query, access.thread.id, [
              { userId: currentUser.id, role: 'admin' },
            ])
          },
        }
      : {}),
  })
}
