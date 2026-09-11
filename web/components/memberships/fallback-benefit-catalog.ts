import type { MembershipBenefitCatalog } from '@/types/api-responses'

// Kept for the independent web-first rollout window: older membership-plan API responses do not
// include `benefit_catalog`, but the public plans page must still explain the paid plans.
export const fallbackMembershipBenefitCatalog: MembershipBenefitCatalog = {
  version: 1,
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
}

function benefit(
  id: MembershipBenefitCatalog['groups'][number]['benefits'][number]['id'],
  placements: MembershipBenefitCatalog['groups'][number]['benefits'][number]['placements'],
  free: MembershipBenefitCatalog['groups'][number]['benefits'][number]['values']['free'],
  plus: MembershipBenefitCatalog['groups'][number]['benefits'][number]['values']['plus'],
  pro: MembershipBenefitCatalog['groups'][number]['benefits'][number]['values']['pro'],
) {
  return { id, placements, values: { free, plus, pro } }
}

function access(access: 'after_wait' | 'immediate') {
  return { kind: 'access' as const, access }
}

function availability(included: boolean) {
  return { kind: 'availability' as const, included }
}

function level(
  level: 'none' | 'standard' | 'more' | 'most' | 'higher' | 'priority' | 'highest_priority',
) {
  return { kind: 'level' as const, level }
}

function quantity(quantity: number) {
  return { kind: 'quantity' as const, quantity }
}
