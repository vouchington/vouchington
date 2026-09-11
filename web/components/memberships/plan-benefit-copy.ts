import type { Translator } from '@ts-shared/ui-messages'

interface BenefitCopy {
  label: string
  tooltip: string
}

export function presentBenefitCopy(id: string, t: Translator): BenefitCopy | null {
  const key = 'extracted.memberships.benefitCatalog.'
  const copies: Record<string, BenefitCopy> = {
    public_contribution_access: {
      label: t(`${key}access_0c11c1a5`),
      tooltip: t(`${key}accessTooltip_0c11c1a6`),
    },
    contribution_capacity: {
      label: t(`${key}contributionCapacity_0c11c1a7`),
      tooltip: t(`${key}contributionCapacityTooltip_0c11c1a8`),
    },
    manual_topic_tags: {
      label: t(`${key}manualTopicTags_0c11c1a9`),
      tooltip: t(`${key}manualTopicTagsTooltip_0c11c1aa`),
    },
    automatic_post_topics: {
      label: t(`${key}automaticPostTopics_0c11c1ab`),
      tooltip: t(`${key}automaticPostTopicsTooltip_0c11c1ac`),
    },
    research_agent_requests: {
      label: t(`${key}researchRequests_0c11c1ad`),
      tooltip: t(`${key}researchRequestsTooltip_0c11c1ae`),
    },
    api_allowance_boost: {
      label: t(`${key}apiAllowance_0c11c1af`),
      tooltip: t(`${key}apiAllowanceTooltip_0c11c1b0`),
    },
    ugc_downvote_counts: {
      label: t(`${key}downvoteCounts_0c11c1b1`),
      tooltip: t(`${key}downvoteCountsTooltip_0c11c1b2`),
    },
    url_crawl_history: {
      label: t(`${key}urlCrawlHistory_0c11c1b3`),
      tooltip: t(`${key}urlCrawlHistoryTooltip_0c11c1b4`),
    },
    community_agent_rules: {
      label: t(`${key}communityAgentRules_0c11c1b5`),
      tooltip: t(`${key}communityAgentRulesTooltip_0c11c1b6`),
    },
    support_service_level: {
      label: t(`${key}supportServiceLevel_0c11c1c1`),
      tooltip: t(`${key}supportServiceLevelTooltip_0c11c1c2`),
    },
    amex_card_link_expansion: {
      label: t(`${key}amexExpansion_0c11c1b7`),
      tooltip: t(`${key}amexExpansionTooltip_0c11c1b8`),
    },
  }
  return copies[id] ?? null
}
