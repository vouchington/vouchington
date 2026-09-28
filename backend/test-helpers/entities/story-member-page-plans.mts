import { write } from '@data-stores/psql'
import { collectPlanNodes, definePlanStatisticsRefresh } from '../query-plans.mts'

export const analyzeStoryMemberPlanTables = definePlanStatisticsRefresh(async () => {
  await write(`/* analyzeStoryMemberPlanTables */ ANALYZE
    stories, rss_feed_items, rss_feed_item_sources, rss_feeds, urls, url_hostnames, topics,
    rss_feed_item_categories, topic_aliases, relation__rss_feed_item__category__topic,
    relation__rss_feed_item__category__topic_alias, relation__topic__publisher_type__topic,
    relation__user__mute__topic, relation__user__mute__rss_feed,
    relation__user__hide__rss_feed_item, relation__user__proxy_mute__community,
    relation__user__block__url_hostname, relation__user__mute__url_hostname,
    communities, community_members, community_list_items__topics, community_list_items__rss_feeds
  `)
})

export function assertBoundedStoryMemberPlan(
  plan: unknown,
  limit: number,
  after: boolean,
  excludesPrimary = false,
): void {
  const nodes = collectPlanNodes(plan)
  const membership = nodes.filter(node => node.Alias === 'rss_feed_items')
  if (!membership.length) throw new Error('Story membership scan missing')
  for (const node of membership) {
    const work =
      (Number(node['Actual Rows']) +
        Number(node['Rows Removed by Filter'] ?? 0) +
        Number(node['Rows Removed by Index Recheck'] ?? 0)) *
      Number(node['Actual Loops'])
    const indexCondition = String(node['Index Cond'] ?? '')
    if (
      !['Index Scan', 'Index Only Scan'].includes(String(node['Node Type'])) ||
      !indexCondition.includes('story_id =') ||
      (after && !indexCondition.includes('id <')) ||
      work > limit + 1 + Number(excludesPrimary)
    )
      throw new Error(`Unbounded story membership work: ${work}`)
  }
  if (!nodes.some(node => node['Node Type'] === 'Limit' && node['Actual Rows'] === limit + 1)) {
    throw new Error('Story membership lookahead limit missing')
  }
}
