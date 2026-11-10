import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  TRENDING_COMMUNITY_MEMBER_COUNT_CAP_MAX,
  trendingCommunitiesConfig,
} from '@services/communities/trending-member-count-cap'

export const trendingCommunitiesRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'trending-communities-config',
  label: 'Trending communities',
  description: 'How many active members the trending-communities refresh counts per community.',
  config: trendingCommunitiesConfig,
  access: { update_roles: ['developer'] },
  fields: {
    member_count_cap: {
      description:
        'Each community contributes at most this many active members to its trending score. One extra row sets members_capped.',
      minValue: 1,
      maxValue: TRENDING_COMMUNITY_MEMBER_COUNT_CAP_MAX,
      integer: true,
    },
  },
})
