import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { anyPairAmongUsersBlockedOrMuted } from '@services/entity-relations/check-block-mute'
import { getPrivateUsersByAnyBatch } from '@services/users/get-private-batch'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'
import {
  findOrCreateDirectConversation,
  createGroupConversation,
  createConversationMessage,
} from './create.mts'
import {
  currentUserCanViewConversation,
  currentUserCanSendMessage,
  currentUserCanManageParticipants,
  currentUserCanChangeParticipantPolicy,
} from './authorization.mts'
import { currentUserCanMessageUsers } from './message-eligibility.mts'
import {
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantAddPolicy,
} from './participants.mts'
import type { MessageRequestValidation } from './my-message-request.mts'

type CreateConversationRequest = { user_id: string } | { user_ids: string[] }
type SendMessageRequest = { text: string }
type AddParticipantRequest = { user_id: string }
type UpdateParticipantAddPolicyRequest = { participant_add_policy: 'owner_only' | 'all_members' }

export async function createMyMessageConversation(
  currentUser: PrivateUser,
  readBody: () => Promise<CreateConversationRequest>,
  validate: MessageRequestValidation,
) {
  assertNotSuspended(currentUser)

  const body = await readBody()
  validate({ body })

  const rawUserIds = 'user_id' in body ? [body.user_id] : body.user_ids
  // Normalize to lowercase so case variants of the same UUID compare equal, then deduplicate.
  const userIds = Array.from(new Set(rawUserIds.map(id => id.toLowerCase())))
  assert(!userIds.includes(currentUser.id), 400, 'Cannot message yourself')

  const loaded = await getPrivateUsersByAnyBatch(userIds)
  const recipients = loaded.filter(recipient => recipient != null)
  assert(recipients.length === userIds.length, 404, 'Recipient not found')
  assert(
    await currentUserCanMessageUsers(currentUser.id, recipients),
    403,
    'You cannot send messages to this user',
  )

  if (userIds.length > 1) {
    const pairBlocked = await anyPairAmongUsersBlockedOrMuted(userIds)
    assert(!pairBlocked, 403, 'Cannot create a group containing blocked users')
  }

  const conversation =
    userIds.length === 1
      ? await findOrCreateDirectConversation(currentUser.id, userIds[0]!)
      : await createGroupConversation(currentUser.id, userIds)
  return { conversation }
}

export async function sendMyConversationMessage(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  readBody: () => Promise<SendMessageRequest>,
  validate: MessageRequestValidation,
) {
  const provenance = getRequestContentProvenance()
  assertNotSuspended(currentUser)

  const conversationId = path.conversationId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canSend = await currentUserCanSendMessage(currentUser.id, conversationId)
  assert(canSend, 403, 'Access denied')

  const body = await readBody()
  validate({
    path,
    body,
  })
  // The schema fixes the type; a whitespace-only message is a semantic rejection.
  assert(body.text.trim().length > 0, 400, 'text is required')

  const message = await createConversationMessage(
    currentUser.id,
    provenance,
    conversationId,
    body.text,
  )
  return { message }
}

export async function addMyConversationParticipant(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  readBody: () => Promise<AddParticipantRequest>,
  validate: MessageRequestValidation,
) {
  assertNotSuspended(currentUser)

  const conversationId = path.conversationId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  // The service repeats this check; running it first keeps the schema diagnostic behind the role gate.
  const canManage = await currentUserCanManageParticipants(currentUser.id, conversationId)
  assert(canManage, 403, 'Access denied')

  const body = await readBody()
  validate({
    path,
    body,
  })

  const newUserId = body.user_id.toLowerCase()
  assert(newUserId !== currentUser.id, 400, 'Cannot add yourself — you are already a participant')

  const participant = await addConversationParticipant(currentUser.id, conversationId, newUserId)
  return { participant }
}

export async function removeMyConversationParticipant(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  validate: MessageRequestValidation,
) {
  assertNotSuspended(currentUser)

  const conversationId = path.conversationId!
  const targetUserId = path.userId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  assert(isUUID(targetUserId), 422, 'Invalid user ID')

  const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
  assert(canView, 403, 'Access denied')
  validate({ path })

  await removeConversationParticipant(currentUser.id, conversationId, targetUserId.toLowerCase())
}

export async function updateMyConversationPolicy(
  currentUser: PrivateUser,
  path: Record<string, string | undefined>,
  readBody: () => Promise<UpdateParticipantAddPolicyRequest>,
  validate: MessageRequestValidation,
) {
  assertNotSuspended(currentUser)

  const conversationId = path.conversationId!
  assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  // The service repeats this check; running it first keeps the schema diagnostic behind the role gate.
  const canChange = await currentUserCanChangeParticipantPolicy(currentUser.id, conversationId)
  assert(canChange, 403, 'Only the owner can change participant policy')

  const body = await readBody()
  validate({
    path,
    body,
  })

  await updateConversationParticipantAddPolicy(
    currentUser.id,
    conversationId,
    body.participant_add_policy,
  )

  return { participant_add_policy: body.participant_add_policy }
}
