import { write } from '@data-stores/psql'
import { DynamicConfig } from '@data-stores/valkey'
import sql from 'sql-template-strings'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const TRENDING_COMMUNITY_MEMBER_COUNT_CAP_DEFAULT = 1_000
export const TRENDING_COMMUNITY_MEMBER_COUNT_CAP_MAX = 10_000

export const trendingCommunitiesConfig = new DynamicConfig({
  key: 'trending-communities-config',
  fieldTypes: { member_count_cap: 'number' },
  defaultFields: { member_count_cap: TRENDING_COMMUNITY_MEMBER_COUNT_CAP_DEFAULT },
})

function getTrendingCommunityMemberCountCap(): number {
  return getBoundedPositiveIntegerField(trendingCommunitiesConfig, 'member_count_cap', {
    defaultValue: TRENDING_COMMUNITY_MEMBER_COUNT_CAP_DEFAULT,
    maxValue: TRENDING_COMMUNITY_MEMBER_COUNT_CAP_MAX,
  })
}

/** Writes the current cap before refresh. The view reads the committed row on the refresh connection. */
export async function syncTrendingCommunityMemberCountCap(): Promise<void> {
  await trendingCommunitiesConfig.waitForInitialization()
  const cap = getTrendingCommunityMemberCountCap()
  await write(sql`/* syncTrendingCommunityMemberCountCap */
    INSERT INTO trending_community_member_count_caps (is_singleton, member_count_cap)
    VALUES (TRUE, ${cap})
    ON CONFLICT (is_singleton) DO UPDATE
    SET member_count_cap = EXCLUDED.member_count_cap
    WHERE trending_community_member_count_caps.member_count_cap IS DISTINCT FROM EXCLUDED.member_count_cap
  `)
}
