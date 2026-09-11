type JsonBody = Record<string, unknown>

const topicResults = [
  { id: 'topic-1', name: 'Chase Sapphire Reserve' },
  { id: 'topic-2', name: 'Airport Lounges' },
]

const postResults = [
  { id: 'post-1', title: 'My First Post', post_type: 'review' },
  { id: 'post-2', title: 'Transfer bonus thread', post_type: 'discussion' },
]

const userResults = [
  { id: 'user-1', username: 'alice', display_account: { name: 'Alice Chen' } },
  { id: 'user-2', username: 'travel-pro', display_account: null },
]

const urlResults = [
  { id: 'url-1', url: 'https://example.com/card-guide' },
  { id: 'url-2', url: 'https://news.example.com/points' },
]

export function storybookAutocompleteResponse(pathname: string): JsonBody | null {
  if (pathname === '/api/v1/topics') {
    return {
      topics: Object.fromEntries(topicResults.map(topic => [topic.id, topic])),
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }

  if (pathname === '/api/v1/posts') {
    return {
      posts: Object.fromEntries(postResults.map(post => [post.id, post])),
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }

  if (pathname === '/api/v1/users') {
    return {
      results: userResults,
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }

  if (pathname === '/api/v1/urls') {
    return {
      results: urlResults,
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
  }

  return null
}

export function createAutocompleteFetch(originalFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(rawUrl, window.location.origin)
    const body = storybookAutocompleteResponse(url.pathname)

    if (body) {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return originalFetch(input, init)
  }
}
