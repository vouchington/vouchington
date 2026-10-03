import createHttpError from 'http-errors'
import {
  getPrivateUserByAny,
  getPublicUserByIdOrSlug,
  isAdminUser,
  isPlatformAccount,
} from '@services/users'
import { isUserTagTopicId } from '@services/topics/user-tag-topics'
import type { PrivateUser } from '@services/users/types'

/** Shared domain guard for user-tag relation creation and voting. */
export async function assertUserTagAllowed(
  currentUser: PrivateUser,
  targetUserIdOrSlug: string,
  topicId: string,
): Promise<string> {
  if (!isAdminUser(currentUser) && isPlatformAccount(currentUser)) {
    throw createHttpError(
      403,
      'Official and automated accounts cannot create community trust signals.',
    )
  }
  const [publicTarget, curatedTopic] = await Promise.all([
    getPublicUserByIdOrSlug(targetUserIdOrSlug, { readOnly: false }),
    isUserTagTopicId(topicId),
  ])
  if (!publicTarget) throw createHttpError(404, 'User not found')
  if (publicTarget.id === currentUser.id) throw createHttpError(403, 'Cannot tag yourself')
  const target = await getPrivateUserByAny(publicTarget.id, { readOnly: false })
  if (!target) throw createHttpError(404, 'User not found')
  if (target.suspended_at) throw createHttpError(403, 'Cannot tag a suspended user')
  if (!curatedTopic) throw createHttpError(422, 'Invalid user tag')
  return target.id
}
