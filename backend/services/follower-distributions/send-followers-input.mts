import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import { MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS } from './types.mts'

export type SendFollowersInput =
  | { audience: 'all_followers' }
  | { audience: 'selected_followers'; recipient_user_ids: string[] }

export function parseSendFollowersInput(body: unknown): SendFollowersInput {
  if (!body || typeof body !== 'object') {
    throw createError(400, 'Invalid request body')
  }

  const input = body as Record<string, unknown>

  if (input.audience !== 'all_followers' && input.audience !== 'selected_followers') {
    throw createError(400, 'Invalid audience')
  }

  if (input.audience === 'selected_followers') {
    assertOnlyFields(input, ['audience', 'recipient_user_ids'])

    if (!Array.isArray(input.recipient_user_ids)) {
      throw createError(400, 'recipient_user_ids is required for selected_followers')
    }

    if (input.recipient_user_ids.length === 0) {
      throw createError(400, 'recipient_user_ids must include at least one follower')
    }

    if (input.recipient_user_ids.length > MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS) {
      throw createError(
        400,
        `recipient_user_ids can include at most ${MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS} followers`,
      )
    }

    const recipientUserIds = input.recipient_user_ids.filter(
      (id): id is string => typeof id === 'string' && isUUID(id),
    )

    if (recipientUserIds.length !== input.recipient_user_ids.length) {
      throw createError(400, 'recipient_user_ids must contain valid UUIDs')
    }

    if (new Set(recipientUserIds).size !== recipientUserIds.length) {
      throw createError(400, 'recipient_user_ids must not contain duplicates')
    }

    return {
      audience: input.audience,
      recipient_user_ids: recipientUserIds,
    }
  }

  assertOnlyFields(input, ['audience'])
  return { audience: input.audience }
}

function assertOnlyFields(input: Record<string, unknown>, allowedFields: string[]): void {
  if (Object.keys(input).some(field => !allowedFields.includes(field))) {
    throw createError(400, 'Unexpected request fields')
  }
}
