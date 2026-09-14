import type { Translator } from '@ts-shared/ui-messages'

interface BenefitCopy {
  label: string
  tooltip: string
}

export function presentBenefitCopy(id: string, t: Translator): BenefitCopy | null {
  const copies: Record<string, BenefitCopy> = {
    public_contribution_access: {
      label: t('extracted.memberships.benefitCatalog.access_0c11c1a5'),
      tooltip: t('extracted.memberships.benefitCatalog.accessTooltip_0c11c1a6'),
    },
    contribution_capacity: {
      label: t('extracted.memberships.benefitCatalog.contributionCapacity_0c11c1a7'),
      tooltip: t('extracted.memberships.benefitCatalog.contributionCapacityTooltip_0c11c1a8'),
    },
    manual_topic_tags: {
      label: t('extracted.memberships.benefitCatalog.manualTopicTags_0c11c1a9'),
      tooltip: t('extracted.memberships.benefitCatalog.manualTopicTagsTooltip_0c11c1aa'),
    },
    automatic_post_topics: {
      label: t('extracted.memberships.benefitCatalog.automaticPostTopics_0c11c1ab'),
      tooltip: t('extracted.memberships.benefitCatalog.automaticPostTopicsTooltip_0c11c1ac'),
    },
    research_agent_requests: {
      label: t('extracted.memberships.benefitCatalog.researchRequests_0c11c1ad'),
      tooltip: t('extracted.memberships.benefitCatalog.researchRequestsTooltip_0c11c1ae'),
    },
    api_allowance_boost: {
      label: t('extracted.memberships.benefitCatalog.apiAllowance_0c11c1af'),
      tooltip: t('extracted.memberships.benefitCatalog.apiAllowanceTooltip_0c11c1b0'),
    },
    ugc_downvote_counts: {
      label: t('extracted.memberships.benefitCatalog.downvoteCounts_0c11c1b1'),
      tooltip: t('extracted.memberships.benefitCatalog.downvoteCountsTooltip_0c11c1b2'),
    },
    url_crawl_history: {
      label: t('extracted.memberships.benefitCatalog.urlCrawlHistory_0c11c1b3'),
      tooltip: t('extracted.memberships.benefitCatalog.urlCrawlHistoryTooltip_0c11c1b4'),
    },
    community_agent_rules: {
      label: t('extracted.memberships.benefitCatalog.communityAgentRules_0c11c1b5'),
      tooltip: t('extracted.memberships.benefitCatalog.communityAgentRulesTooltip_0c11c1b6'),
    },
    support_service_level: {
      label: t('extracted.memberships.benefitCatalog.supportServiceLevel_0c11c1c1'),
      tooltip: t('extracted.memberships.benefitCatalog.supportServiceLevelTooltip_0c11c1c2'),
    },
    amex_card_link_expansion: {
      label: t('extracted.memberships.benefitCatalog.amexExpansion_0c11c1b7'),
      tooltip: t('extracted.memberships.benefitCatalog.amexExpansionTooltip_0c11c1b8'),
    },
  }
  return copies[id] ?? null
}
