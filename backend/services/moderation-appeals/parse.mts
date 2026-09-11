import assert from 'http-assert'
import { isUUID } from '@ts-shared/utils/validation-core'

export interface CreateModerationAppealInput {
  targetType: 'warning' | 'ban' | 'removal' | 'suspension'
  targetId?: string
  appealReason: string
  postRemovalKind?: 'platform' | 'community'
}

export function parseCreateModerationAppealInput(raw: unknown): CreateModerationAppealInput {
  const body = raw as Record<string, unknown>
  assert(
    typeof body.target_type === 'string' &&
      (body.target_type === 'warning' ||
        body.target_type === 'ban' ||
        body.target_type === 'removal' ||
        body.target_type === 'suspension'),
    422,
    'target_type must be one of: warning, ban, removal, suspension',
  )
  const isSuspension = body.target_type === 'suspension'
  if (!isSuspension) {
    assert(
      typeof body.target_id === 'string' && body.target_id.trim().length > 0,
      422,
      'target_id is required',
    )
    assert(isUUID(body.target_id as string), 422, 'target_id must be a valid UUID')
  }
  assert(
    typeof body.appeal_reason === 'string' && body.appeal_reason.trim().length > 0,
    422,
    'appeal_reason is required',
  )
  assert((body.appeal_reason as string).length <= 4000, 422, 'appeal_reason too long')
  let postRemovalKind: 'platform' | 'community' | undefined
  if (body.post_removal_kind !== undefined) {
    assert(body.target_type === 'removal', 422, 'post_removal_kind is only valid for removals')
    assert(
      body.post_removal_kind === 'platform' || body.post_removal_kind === 'community',
      422,
      'post_removal_kind must be one of: platform, community',
    )
    postRemovalKind = body.post_removal_kind
  }
  return {
    targetType: body.target_type as 'warning' | 'ban' | 'removal' | 'suspension',
    ...(isSuspension ? {} : { targetId: (body.target_id as string).trim() }),
    appealReason: (body.appeal_reason as string).trim(),
    ...(postRemovalKind ? { postRemovalKind } : {}),
  }
}
