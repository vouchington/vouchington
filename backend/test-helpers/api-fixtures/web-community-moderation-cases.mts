import { webCommunityMemberModerationApiFixtureCases } from './web-community-member-moderation-cases.mts'
import { webCommunityModmailApiFixtureCases } from './web-community-modmail-cases.mts'
import { webCommunitySavedReplyApiFixtureCases } from './web-community-saved-reply-cases.mts'
import { webCommunityModerationQueueApiFixtureCases } from './web-community-moderation-queue-cases.mts'
import { webCommunityModeratorAnalyticsApiFixtureCases } from './web-community-moderator-analytics-cases.mts'
import { webCommunityAgentPromptApiFixtureCases } from './web-community-agent-prompt-cases.mts'
import { webCommunityAutomodApiFixtureCases } from './web-community-automod-cases.mts'
import { webCommunityModerationActionApiFixtureCases } from './web-community-moderation-action-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityModerationApiFixtureCases: ApiFixtureCase[] = [
  ...webCommunityMemberModerationApiFixtureCases,
  ...webCommunityModmailApiFixtureCases,
  ...webCommunitySavedReplyApiFixtureCases,
  ...webCommunityModerationQueueApiFixtureCases,
  ...webCommunityModeratorAnalyticsApiFixtureCases,
  ...webCommunityAgentPromptApiFixtureCases,
  ...webCommunityAutomodApiFixtureCases,
  ...webCommunityModerationActionApiFixtureCases,
]
