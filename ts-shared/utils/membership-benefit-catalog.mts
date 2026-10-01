import { buildMembershipBenefitCatalog as buildCatalog } from '@vouchington/memberships'

export const MEMBERSHIP_BENEFIT_CATALOG_VERSION = 1

export type MembershipBenefitPlan = 'free' | 'plus' | 'pro'
export type MembershipBenefitPlacement = 'card' | 'comparison'

export type MembershipBenefitValue =
  | { kind: 'access'; access: 'after_wait' | 'immediate' }
  | { kind: 'availability'; included: boolean }
  | {
      kind: 'level'
      level: 'none' | 'standard' | 'more' | 'most' | 'higher' | 'priority' | 'highest_priority'
    }
  | { kind: 'quantity'; quantity: number }

export type MembershipBenefit = {
  id:
    | 'public_contribution_access'
    | 'contribution_capacity'
    | 'manual_topic_tags'
    | 'automatic_post_topics'
    | 'research_agent_requests'
    | 'api_allowance_boost'
    | 'ugc_downvote_counts'
    | 'url_crawl_history'
    | 'community_agent_rules'
    | 'support_service_level'
    | 'amex_card_link_expansion'
  placements: MembershipBenefitPlacement[]
  values: Record<MembershipBenefitPlan, MembershipBenefitValue>
}

export type MembershipBenefitGroup = {
  id: 'contribute' | 'research' | 'communities' | 'support' | 'referrals'
  benefits: MembershipBenefit[]
}

export type MembershipBenefitCatalog = {
  version: typeof MEMBERSHIP_BENEFIT_CATALOG_VERSION
  groups: MembershipBenefitGroup[]
}

/** Catalog IDs must already have live service-boundary enforcement. */
export const ENFORCED_MEMBERSHIP_BENEFIT_IDS = new Set<MembershipBenefit['id']>([
  'public_contribution_access',
  'contribution_capacity',
  'manual_topic_tags',
  'automatic_post_topics',
  'research_agent_requests',
  'api_allowance_boost',
  'ugc_downvote_counts',
  'url_crawl_history',
  'community_agent_rules',
  'support_service_level',
  'amex_card_link_expansion',
])

export const membershipBenefitCatalog = buildMembershipBenefitCatalog({
  version: MEMBERSHIP_BENEFIT_CATALOG_VERSION,
  groups: [
    {
      id: 'contribute',
      benefits: [
        benefit(
          'public_contribution_access',
          ['card', 'comparison'],
          access('after_wait'),
          access('immediate'),
          access('immediate'),
        ),
        benefit(
          'contribution_capacity',
          ['card', 'comparison'],
          level('standard'),
          level('more'),
          level('most'),
        ),
        benefit(
          'manual_topic_tags',
          ['comparison'],
          level('standard'),
          level('more'),
          level('most'),
        ),
        benefit(
          'automatic_post_topics',
          ['card', 'comparison'],
          level('none'),
          level('more'),
          level('most'),
        ),
      ],
    },
    {
      id: 'research',
      benefits: [
        benefit(
          'research_agent_requests',
          ['comparison'],
          level('standard'),
          level('more'),
          level('most'),
        ),
        benefit(
          'api_allowance_boost',
          ['comparison'],
          level('standard'),
          level('higher'),
          level('higher'),
        ),
        benefit(
          'ugc_downvote_counts',
          ['card', 'comparison'],
          availability(false),
          availability(true),
          availability(true),
        ),
        benefit(
          'url_crawl_history',
          ['comparison'],
          availability(false),
          availability(true),
          availability(true),
        ),
      ],
    },
    {
      id: 'communities',
      benefits: [
        benefit(
          'community_agent_rules',
          ['card', 'comparison'],
          quantity(0),
          quantity(3),
          quantity(10),
        ),
      ],
    },
    {
      id: 'support',
      benefits: [
        benefit(
          'support_service_level',
          ['card', 'comparison'],
          level('standard'),
          level('priority'),
          level('highest_priority'),
        ),
      ],
    },
    {
      id: 'referrals',
      benefits: [
        benefit(
          'amex_card_link_expansion',
          ['comparison'],
          availability(false),
          availability(true),
          availability(true),
        ),
      ],
    },
  ],
})

export function buildMembershipBenefitCatalog(
  catalog: MembershipBenefitCatalog,
): MembershipBenefitCatalog {
  const { plans: _, ...publicCatalog } = buildCatalog(
    { ...catalog, plans: ['free', 'plus', 'pro'] as const },
    ENFORCED_MEMBERSHIP_BENEFIT_IDS,
  )
  return publicCatalog
}

function benefit(
  id: MembershipBenefit['id'],
  placements: MembershipBenefitPlacement[],
  free: MembershipBenefitValue,
  plus: MembershipBenefitValue,
  pro: MembershipBenefitValue,
): MembershipBenefit {
  return { id, placements, values: { free, plus, pro } }
}

function access(value: Extract<MembershipBenefitValue, { kind: 'access' }>['access']) {
  return { kind: 'access' as const, access: value }
}
function availability(included: boolean) {
  return { kind: 'availability' as const, included }
}
function level(value: Extract<MembershipBenefitValue, { kind: 'level' }>['level']) {
  return { kind: 'level' as const, level: value }
}
function quantity(value: number) {
  return { kind: 'quantity' as const, quantity: value }
}
