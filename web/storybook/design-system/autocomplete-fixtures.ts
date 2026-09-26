type JsonBody = Record<string, unknown>
type TopicSearchParams = Record<string, string | number | boolean | undefined>

const topicCatalog = [
  { id: 'topic-1', name: 'Chase Sapphire Reserve', topic_type: 'card', spendingCategory: false },
  { id: 'topic-2', name: 'Airport Lounges', topic_type: 'topic', spendingCategory: false },
  {
    id: 'topic-referral',
    name: 'Amex Referrals',
    topic_type: 'referral_program',
    spendingCategory: false,
  },
  {
    id: 'topic-rewards',
    name: 'Ultimate Rewards',
    topic_type: 'rewards_program',
    spendingCategory: false,
  },
  {
    id: 'topic-status',
    name: 'Platinum Elite',
    topic_type: 'rewards_program_status',
    spendingCategory: false,
  },
  { id: 'topic-groceries', name: 'Groceries', topic_type: 'topic', spendingCategory: true },
]

function topicSearchBody(searchParams?: TopicSearchParams): JsonBody {
  const requested = searchParams?.topic_types
  const types = typeof requested === 'string' ? requested.split(',').filter(Boolean) : []
  const spending =
    searchParams?.spending_category === true || searchParams?.spending_category === 'true'
  const visible = topicCatalog.filter(topic => {
    if (spending) return topic.spendingCategory
    if (types.length > 0) return types.includes(topic.topic_type)
    return topic.id === 'topic-1' || topic.id === 'topic-2'
  })
  return {
    topics: Object.fromEntries(
      visible.map(topic => [
        topic.id,
        { id: topic.id, name: topic.name, topic_type: topic.topic_type },
      ]),
    ),
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }
}

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

export function storybookAutocompleteResponse(
  pathname: string,
  searchParams?: TopicSearchParams,
): JsonBody | null {
  if (pathname === '/api/v1/topics') return topicSearchBody(searchParams)

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
