import type { CommunityModerationHandler } from './community-moderation-contract.mts'
import {
  setCommunityApplicationQuestions,
  reviewApplication,
} from './community-moderation-update-applications.mts'
import { updateCommunitySettings } from './community-moderation-update-community.mts'
import {
  updateModmailThread,
  updateCommunityPostTypeSettings,
} from './community-moderation-update-modmail-post-settings.mts'
import { moderateCommunityPost } from './community-moderation-update-publications.mts'
import { resolveCommunityReport } from './community-moderation-update-reports.mts'
import { setCommunityPinnedPosts } from './community-moderation-update-pinned-posts.mts'
import {
  setModeratorVacation,
  setVacationDigestPreference,
} from './community-moderation-update-vacation.mts'

export const communityModerationUpdates: Record<string, CommunityModerationHandler> = {
  update_community_settings: updateCommunitySettings,
  review_application: reviewApplication,
  set_vacation_digest_preference: setVacationDigestPreference,
  update_modmail_thread: updateModmailThread,
  update_post_type_settings: updateCommunityPostTypeSettings,
  moderate_post: moderateCommunityPost,
  resolve_report: resolveCommunityReport,
  set_application_questions: setCommunityApplicationQuestions,
  set_moderator_vacation: setModeratorVacation,
  set_pinned_posts: setCommunityPinnedPosts,
}
