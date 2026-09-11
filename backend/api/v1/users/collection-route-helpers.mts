import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import createHttpError from 'http-errors'
import {
  currentUserCanAccessUser,
  currentUserCanViewUserContent,
  getPrivateUserByIdOrSlug,
  getPublicUserByIdOrSlug,
  getUserPrivacySettings,
} from '@services/users'

export type AudienceField =
  | 'cards_visibility'
  | 'rewards_program_statuses_visibility'
  | 'spending_categories_visibility'
  | 'follows_visibility'
  | 'topic_follows_visibility'
  | 'rss_feed_follows_visibility'
  | 'community_memberships_visibility'
  | 'followers_visibility'
  | 'likes_visibility'

export async function resolveTargetUser(
  ctx: Context,
  options: {
    privateCollection: boolean
    visibilityField?: AudienceField
  },
): Promise<{
  currentUser: Awaited<ReturnType<Context['getCurrentUser']>>
  target: NonNullable<
    | Awaited<ReturnType<typeof getPublicUserByIdOrSlug>>
    | Awaited<ReturnType<typeof getPrivateUserByIdOrSlug>>
  >
  privateCollection: boolean
}> {
  const currentUser = await ctx.getCurrentUser()
  const idOrSlug = ctx.params.idOrSlug!
  const isSelf =
    currentUser?.id === idOrSlug ||
    (currentUser?.username && idOrSlug.toLowerCase() === currentUser.username.toLowerCase())

  if (options.privateCollection) {
    ctx.assert(currentUser, 401, 'Unauthorized')
  }

  const target =
    options.privateCollection || isSelf
      ? await getPrivateUserByIdOrSlug(idOrSlug)
      : await getPublicUserByIdOrSlug(idOrSlug)

  ctx.assert(target, 404, 'User not found')
  const targetUser = target

  if (options.privateCollection) {
    ctx.assert(currentUserCanAccessUser(currentUser, targetUser.id), 403, 'Forbidden')
  }

  if (options.visibilityField && !options.privateCollection && !isSelf) {
    const settings = await getUserPrivacySettings(targetUser.id)
    const audience = settings[options.visibilityField]
    const canView = await currentUserCanViewUserContent(currentUser, targetUser.id, audience)
    ctx.assert(canView, 404, 'User not found')
  }

  return { currentUser, target: targetUser, privateCollection: options.privateCollection }
}

export function applyCacheHeaders(
  ctx: Context,
  isPublicCollection: boolean,
  currentUser: Awaited<ReturnType<Context['getCurrentUser']>>,
) {
  if (isPublicCollection && !currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }
}

export function assertSetValue<T extends string>(
  value: string | undefined,
  validValues: Set<T>,
  message: string,
): T {
  if (!value || !validValues.has(value as T)) {
    throw createHttpError(400, message)
  }
  return value as T
}

const VALID_FEED_TYPES = new Set<'article' | 'podcast' | 'video' | 'mixed'>([
  'article',
  'podcast',
  'video',
  'mixed',
])

export function parseFeedType(
  value: unknown,
): 'article' | 'podcast' | 'video' | 'mixed' | undefined {
  if (value === undefined || value === null) return undefined
  if (
    typeof value !== 'string' ||
    !VALID_FEED_TYPES.has(value as 'article' | 'podcast' | 'video' | 'mixed')
  ) {
    throw createHttpError(400, 'Invalid feed_type: must be article, podcast, video, or mixed')
  }
  return value as 'article' | 'podcast' | 'video' | 'mixed'
}

const VALID_MEDIA_TYPES = new Set<'article' | 'audio' | 'video'>(['article', 'audio', 'video'])

export function parseMediaType(value: unknown): 'article' | 'audio' | 'video' | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !VALID_MEDIA_TYPES.has(value as 'article' | 'audio' | 'video')) {
    throw createHttpError(400, 'Invalid media_type: must be article, audio, or video')
  }
  return value as 'article' | 'audio' | 'video'
}
