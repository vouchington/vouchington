import getMyReferralLinksTool from '../get-my-referral-links.mts'
import getPlatformStatsTool from '../get-platform-stats.mts'
import getTopicReferralProgramTool from '../get-topic-referral-program.mts'
import getTrendingCommunitiesTool from '../get-trending-communities.mts'
import getTrendingReferralProgramsTool from '../get-trending-referral-programs.mts'
import listCountriesTool from '../list-countries.mts'
import listCurrenciesTool from '../list-currencies.mts'
import searchWebTool from '../search-web.mts'

/** The trending, referral program, web search and reference data read tools. */
export const searchReferenceReadTools = [
  getMyReferralLinksTool,
  getPlatformStatsTool,
  getTopicReferralProgramTool,
  getTrendingCommunitiesTool,
  getTrendingReferralProgramsTool,
  listCountriesTool,
  listCurrenciesTool,
  searchWebTool,
]
