import part0 from './extracted-community/communities/addCommunityListItemForm.ts'
import part1 from './extracted-community/communities/applicationForm.ts'
import part2 from './extracted-community/communities/applicationReview.ts'
import part3 from './extracted-community/communities/communitiesSidebarGroup.ts'
import part4 from './extracted-community/communities/communityAgentPromptForm.ts'
import part5 from './extracted-community/communities/communityAgentPromptHistory.ts'
import part6 from './extracted-community/communities/communityAgentPromptItem.ts'
import part7 from './extracted-community/communities/communityAgentPromptStatus.ts'
import part8 from './extracted-community/communities/communityAgentPromptTestPanel.ts'
import part9 from './extracted-community/communities/communityAgentPromptsPanel.ts'
import part10 from './extracted-community/communities/communityAiAgentsPanel.ts'
import part11 from './extracted-community/communities/communityAutomodReviewAction.ts'
import part12 from './extracted-community/communities/communityAutomodReviewPanel.ts'
import part13 from './extracted-community/communities/communityBanDialog.ts'
import part14 from './extracted-community/communities/communityBansPanel.ts'
import part15 from './extracted-community/communities/communityCard.ts'
import part16 from './extracted-community/communities/communityDangerZone.ts'
import part17 from './extracted-community/communities/communityFeed.ts'
import part18 from './extracted-community/communities/communityFilters.ts'
import part19 from './extracted-community/communities/communityHeader.ts'
import part20 from './extracted-community/communities/communityList.ts'
import part21 from './extracted-community/communities/communityListAutocomplete.ts'
import part22 from './extracted-community/communities/communityListItemCard.ts'
import part23 from './extracted-community/communities/communityListItemsList.ts'
import part24 from './extracted-community/communities/communityMemberRow.ts'
import part25 from './extracted-community/communities/communityMembersManager.ts'
import part26 from './extracted-community/communities/communityModeratorStatsPanel.ts'
import part27 from './extracted-community/communities/communityModeratorVacationPanel.ts'
import part28 from './extracted-community/communities/communityModeratorsAside.ts'
import part29 from './extracted-community/communities/communityModlogPanel.ts'
import part30 from './extracted-community/communities/communityNav.ts'
import part31 from './extracted-community/communities/communityOnboardingChecklist.ts'
import part32 from './extracted-community/communities/communityPostTypeSettingsForm.ts'
import part33 from './extracted-community/communities/communityProxyBookmarkButton.ts'
import part34 from './extracted-community/communities/communityRaidModeActiveList.ts'
import part35 from './extracted-community/communities/communityRaidModeForm.ts'
import part36 from './extracted-community/communities/communityRaidModePanel.ts'
import part37 from './extracted-community/communities/communitySettingsFields.ts'
import part38 from './extracted-community/communities/communitySettingsForm.ts'
import part39 from './extracted-community/communities/communityTransferOwnershipDialog.ts'
import part40 from './extracted-community/communities/createCommunityForm.ts'
import part41 from './extracted-community/communities/inviteItem.ts'
import part42 from './extracted-community/communities/inviteManager.ts'
import part43 from './extracted-community/communities/inviteRedemption.ts'
import part44 from './extracted-community/communities/joinButton.ts'
import part45 from './extracted-community/communities/messageModsButton.ts'
import part46 from './extracted-community/communities/modQueue.ts'
import part47 from './extracted-community/communities/modQueueBanEvasion.ts'
import part48 from './extracted-community/communities/modQueuePosts.ts'
import part49 from './extracted-community/communities/modQueueReports.ts'
import part50 from './extracted-community/communities/modQueueWarnButton.ts'
import part51 from './extracted-community/communities/modmailInbox.ts'
import part52 from './extracted-community/communities/page-messages.ts'
import part53 from './extracted-community/communities/pinnedPostsManager.ts'

function merge(parts: Array<Record<string, unknown>>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const part of parts) mergeInto(output, part)
  return output
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      mergeInto(target[key], value)
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default merge([
  part0,
  part1,
  part2,
  part3,
  part4,
  part5,
  part6,
  part7,
  part8,
  part9,
  part10,
  part11,
  part12,
  part13,
  part14,
  part15,
  part16,
  part17,
  part18,
  part19,
  part20,
  part21,
  part22,
  part23,
  part24,
  part25,
  part26,
  part27,
  part28,
  part29,
  part30,
  part31,
  part32,
  part33,
  part34,
  part35,
  part36,
  part37,
  part38,
  part39,
  part40,
  part41,
  part42,
  part43,
  part44,
  part45,
  part46,
  part47,
  part48,
  part49,
  part50,
  part51,
  part52,
  part53,
])
