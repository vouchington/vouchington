import getMyBioTool from '../get-my-bio.mts'
import getMyEmailPreferencesTool from '../get-my-email-preferences.mts'
import getMyNotificationsTool from '../get-my-notifications.mts'
import getMyPreferencesTool from '../get-my-preferences.mts'
import getMyProfileLinksTool from '../get-my-profile-links.mts'
import getMyUnreadNotificationsTool from '../get-my-unread-notifications.mts'
import listMyTopicRecommendationsTool from '../list-my-topic-recommendations.mts'

/**
 * The read tools for the caller's own bio, profile links, notifications, preferences and topic
 * recommendations.
 */
export const ownDataReadTools = [
  getMyBioTool,
  getMyEmailPreferencesTool,
  getMyNotificationsTool,
  getMyPreferencesTool,
  getMyProfileLinksTool,
  getMyUnreadNotificationsTool,
  listMyTopicRecommendationsTool,
]
