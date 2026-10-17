import type { ExplainResult } from '@data-stores/psql'
import { collectPlanNodes, baseRelationName, processedRows } from '../plan-nodes.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

export function assertCorePlanCheck(name: string, result: ExplainResult): void {
  const nodes = collectPlanNodes(result.plan)
  switch (name) {
    case 'universalTopicCandidates': {
      const candidate = nodes.some(node =>
        [
          'relation__post__category__topic',
          'post_review_topic_ratings',
          'post_data_point_topics',
        ].includes(baseRelationName(node)),
      )
      const posts = nodes.filter(
        node => baseRelationName(node) === 'posts' && node['Alias'] === 'posts',
      )
      if (
        !candidate ||
        !posts.some(
          node =>
            String(node['Node Type']).includes('Index') &&
            stringFromUnknown(node['Index Cond'] ?? '').includes('id'),
        ) ||
        posts.some(node => node['Node Type'] === 'Seq Scan')
      )
        throw new Error(
          `${result.name} must drive universal-topic search from reverse-indexed candidates before indexed posts.id lookups`,
        )
      return
    }
    case 'rssStateProjection':
      if (
        nodes.some(
          node =>
            baseRelationName(node) === 'rss_feed_setting_changes' ||
            String(node['Node Type']).includes('Lateral'),
        )
      )
        throw new Error(
          `${result.name} must read projected RSS state without lateral history scans`,
        )
      return
    case 'rssTextCandidates': {
      const indexes = new Set(nodes.map(node => node['Index Name']))
      // Each indexed candidate read is capped at its measured matches plus 20%.
      const candidateCap = result.scenario_id === 'rss-feed-text-search-broad' ? 3000 : 134
      const candidateNodes = nodes.filter(
        node =>
          (baseRelationName(node) === 'rss_feeds' && node['Alias'] === 'rss_feeds') ||
          node['Index Name'] === 'idx_rss_feeds__search_vector' ||
          node['Index Name'] === 'idx_rss_feeds__title_trgm',
      )
      if (
        nodes.some(
          node => node['Node Type'] === 'Seq Scan' && baseRelationName(node) === 'rss_feeds',
        ) ||
        !indexes.has('idx_rss_feeds__search_vector') ||
        !indexes.has('idx_rss_feeds__title_trgm') ||
        candidateNodes.some(node => processedRows(node) > candidateCap)
      )
        throw new Error(
          `${result.name} must read at most ${candidateCap} text candidates through both RSS search indexes`,
        )
      return
    }
    case 'communityTextCandidates': {
      const candidateNodes = nodes.filter(
        node =>
          (baseRelationName(node) === 'communities' && node['Alias'] === 'communities') ||
          node['Index Name'] === 'idx_communities__search',
      )
      if (
        !candidateNodes.some(node => node['Index Name'] === 'idx_communities__search') ||
        candidateNodes.some(node => processedRows(node) > 315) ||
        nodes.some(
          node => node['Node Type'] === 'Seq Scan' && baseRelationName(node) === 'communities',
        )
      )
        throw new Error(`${result.name} must read at most 315 community text candidates via GIN`)
      return
    }
    case 'relationListingOrder':
      if (nodes.some(node => String(node['Node Type']).includes('Sort')))
        throw new Error(`${result.name} must use relation index order without an explicit Sort`)
      return
    case 'entityRelationVotes': {
      const children = new Set(
        nodes
          .map(node => stringFromUnknown(node['Relation Name'] ?? ''))
          .filter(value => /__votes__(?:default|p_\w+)$/.test(value)),
      )
      const [child] = children
      if (
        !/\bentity_relation_id\b/.test(result.query_text) ||
        children.size !== 1 ||
        !child?.startsWith('relation__post__category__topic__votes__')
      )
        throw new Error(
          `${result.name} must constrain entity_relation_id to prune the concrete vote table`,
        )
      return
    }
    case 'userRemovedPosts':
      if (
        nodes.some(node => node['Node Type'] === 'Seq Scan' && baseRelationName(node) === 'posts')
      )
        throw new Error(`${result.name} must not sequentially scan posts for platform removals`)
      return
    case 'topicImportAttempts':
      if (
        nodes.some(
          node =>
            node['Node Type'] === 'Seq Scan' &&
            node['Relation Name'] === 'user_topic_import_attempts',
        )
      )
        throw new Error(`${result.name} must not sequentially scan topic import attempts`)
      return
    default:
      throw new Error(`Unknown custom plan check: ${name}`)
  }
}
