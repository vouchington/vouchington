import type { useTranslations } from '@/lib/i18n/use-translations'
import type { CommunityAutomodActionSetting } from '@/types/api-responses'

type Translate = ReturnType<typeof useTranslations>

export const COMMUNITY_AUTOMOD_ACTIONS = [
  'record_only',
  'review_queue',
  'unpublish',
] as const satisfies readonly CommunityAutomodActionSetting[]

export function isCommunityAutomodActionSetting(
  value: string,
): value is CommunityAutomodActionSetting {
  return COMMUNITY_AUTOMOD_ACTIONS.some(action => action === value)
}

/** The short name of what a community prompt's flag does to a published post. */
export function communityAutomodActionLabel(
  action: CommunityAutomodActionSetting,
  t: Translate,
): string {
  if (action === 'review_queue') {
    return t('extracted.communities.communityAutomodActionForm.sendToReviewQueue_1c3a1b74')
  }
  if (action === 'unpublish') {
    return t('extracted.communities.communityAutomodActionForm.unpublish_2db04a54')
  }
  return t('extracted.communities.communityAutomodActionForm.recordOnly_c9184072')
}

/** What a moderator should expect before choosing the action, including the consequence. */
export function communityAutomodActionDescription(
  action: CommunityAutomodActionSetting,
  t: Translate,
): string {
  if (action === 'review_queue') {
    return t(
      'extracted.communities.communityAutomodActionForm.keepThePostPublishedAndAddIt_56f75b30',
    )
  }
  if (action === 'unpublish') {
    return t(
      'extracted.communities.communityAutomodActionForm.removeThePostFromTheCommunityRight_215c4ec5',
    )
  }
  return t(
    'extracted.communities.communityAutomodActionForm.keepThePostPublishedTheFlagAppears_01b0cba0',
  )
}
