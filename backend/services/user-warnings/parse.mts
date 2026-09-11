import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import {
  USER_WARNING_PUBLIC_MESSAGE_MAX_LENGTH,
  USER_WARNING_REASON_MAX_LENGTH,
} from './config.mts'

export interface CreateUserWarningInput {
  userId: string
  reason: string
  publicMessage: string | null
  communityId: string | null
  reportId: string | null
  resolveReport: boolean
}

export function parseCreateUserWarningInput(raw: {
  userId?: unknown
  reason?: unknown
  publicMessage?: unknown
  communityId?: unknown
  reportId?: unknown
  resolveReport?: unknown
}): CreateUserWarningInput {
  assert(typeof raw.userId === 'string' && isUUID(raw.userId), 422, 'Invalid userId')
  assert(typeof raw.reason === 'string', 422, 'reason is required')
  const reason = raw.reason.trim()
  assert(reason.length > 0, 422, 'reason is required')
  assert(reason.length <= USER_WARNING_REASON_MAX_LENGTH, 422, 'reason is too long')

  assert(
    raw.publicMessage === undefined ||
      raw.publicMessage === null ||
      typeof raw.publicMessage === 'string',
    422,
    'Invalid publicMessage',
  )
  const publicMessage =
    typeof raw.publicMessage === 'string' ? raw.publicMessage.trim() || null : null
  if (publicMessage !== null) {
    assert(
      publicMessage.length <= USER_WARNING_PUBLIC_MESSAGE_MAX_LENGTH,
      422,
      'publicMessage is too long',
    )
  }

  assert(
    raw.communityId === undefined ||
      raw.communityId === null ||
      (typeof raw.communityId === 'string' && isUUID(raw.communityId)),
    422,
    'Invalid communityId',
  )

  assert(
    raw.reportId === undefined ||
      raw.reportId === null ||
      (typeof raw.reportId === 'string' && isUUID(raw.reportId)),
    422,
    'Invalid reportId',
  )

  assert(
    raw.resolveReport === undefined || typeof raw.resolveReport === 'boolean',
    422,
    'Invalid resolveReport',
  )

  return {
    userId: raw.userId as string,
    reason,
    publicMessage,
    communityId: typeof raw.communityId === 'string' ? raw.communityId : null,
    reportId: typeof raw.reportId === 'string' ? raw.reportId : null,
    resolveReport: raw.resolveReport === true,
  }
}
