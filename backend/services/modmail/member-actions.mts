import createError from 'http-errors'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users/suspension-guard'
import { getPrivateUserByAny } from '@services/users/get'
import {
  loadCommunityWithViewer,
  type LoadedCommunity,
} from '@services/communities/load-with-viewer'
import { getCommunityMember } from '@services/communities/members/get'
import {
  currentUserCanOpenModmailThread,
  currentUserCanViewModmailThread,
} from './authorization.mts'
import { openModmailThread, upsertModmailStaffParticipant } from './threads.mts'
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

/** Run after body validation so invalid replies do not add a staff participant. */
export async function admitModmailReplyParticipant(
  currentUser: PrivateUser,
  access: Awaited<ReturnType<typeof loadModmailReplyAccess>>,
) {
  if (access.isMod) await upsertModmailStaffParticipant(access.thread.id, currentUser.id)
}
