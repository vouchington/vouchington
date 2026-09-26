import type { SearchResults, SearchTab } from '../command-search-data'

export function hasVisibleSearchResults(
  activeTab: SearchTab,
  results: SearchResults,
  shortcutCount: number,
): boolean {
  if (activeTab === 'pages') return shortcutCount > 0
  if (activeTab === 'all') return shortcutCount > 0 || hasEntityResults(results)
  return results[activeTab].length > 0
}

function hasEntityResults(results: SearchResults): boolean {
  return (
    results.topics.length > 0 ||
    results.communities.length > 0 ||
    results.posts.length > 0 ||
    results.news.length > 0 ||
    results.domains.length > 0 ||
    results.fediverse.length > 0
  )
}
