import assert from 'http-assert'
import { isUUID } from '@modules/utils'

export interface CreateUserModNoteInput {
  targetUserId: string
  communityId: string | null
  body: string
}

export function parseCreateUserModNoteInput(raw: {
  targetUserId?: unknown
  communityId?: unknown
  body?: unknown
}): CreateUserModNoteInput {
  assert(
    typeof raw.targetUserId === 'string' && isUUID(raw.targetUserId),
    422,
    'Invalid target user ID',
  )
  assert(
    raw.communityId === undefined ||
      raw.communityId === null ||
      (typeof raw.communityId === 'string' && isUUID(raw.communityId)),
    422,
    'Invalid community ID',
  )
  const trimmedBody = typeof raw.body === 'string' ? raw.body.trim() : ''
  assert(trimmedBody.length > 0, 422, 'Body is required')
  assert(trimmedBody.length <= 2000, 422, 'Body must be 2000 characters or fewer')

  return {
    targetUserId: raw.targetUserId as string,
    communityId: (raw.communityId as string | null | undefined) ?? null,
    body: trimmedBody,
  }
}
