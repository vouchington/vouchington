import type { PostsResponseBody } from '@/types/api-responses'

function mergePageSidecars(pages: PostsResponseBody[]) {
  const merge = <T>(select: (page: PostsResponseBody) => Record<string, T> | undefined) =>
    Object.assign({}, ...pages.map(page => select(page) ?? {}))
  return {
    posts: merge(page => page.posts),
    posts_metrics: merge(page => page.posts_metrics),
    post_elections: merge(page => page.post_elections),
    election_votes: merge(page => page.election_votes),
    bookmarks: merge(page => page.bookmarks),
    markdown_to_html: merge(page => page.markdown_to_html),
    post_moderations: merge(page => page.post_moderations),
    agent_moderation_elections: merge(page => page.agent_moderation_elections),
    communities: merge(page => page.communities),
    users: merge(page => page.users),
    post_link_embeds: merge(page => page.post_link_embeds),
  }
}

export function mergePostDescendantPages(pages: PostsResponseBody[]): PostsResponseBody {
  const first = pages[0]!
  const last = pages.at(-1)!
  const seenIds = new Set<string>()
  return {
    ...first,
    results: pages.reduce<PostsResponseBody['results']>((results, page) => {
      for (const result of page.results) {
        if (seenIds.has(result.id)) continue
        seenIds.add(result.id)
        results.push(result)
      }
      return results
    }, []),
    page_info: last.page_info,
    ...mergePageSidecars(pages),
  }
}

/**
 * Ancestor pages arrive target-outward, while each page is ordered root-to-target. Keep the root
 * pinned and prepend later pages so the accumulated trail remains root-to-target.
 */
export function mergePostAncestorPages(pages: PostsResponseBody[]): PostsResponseBody {
  const first = pages[0]!
  const last = pages.at(-1)!
  const root = first.results[0]
  const rootId = root?.id
  const orderedPages = pages.slice(1).toReversed().concat(first)
  const seenIds = new Set(rootId ? [rootId] : [])
  const results = root ? [root] : []

  for (const page of orderedPages) {
    for (const result of page.results) {
      if (seenIds.has(result.id)) continue
      seenIds.add(result.id)
      results.push(result)
    }
  }

  return {
    ...first,
    results,
    page_info: last.page_info,
    ...mergePageSidecars(pages),
  }
}
