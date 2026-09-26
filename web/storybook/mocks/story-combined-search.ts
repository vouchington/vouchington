let enabled = false

export function setCombinedSearchFixture(): void {
  enabled = true
}

export function clearCombinedSearchFixture(): void {
  enabled = false
}

export function combinedSearchGet(endpoint: string): unknown | undefined {
  if (!enabled || endpoint !== '/api/v1/search') return undefined
  return {
    topics: [
      {
        id: 'topic-sapphire-reserve',
        name: 'Sapphire Reserve',
        slug: 'sapphire-reserve',
        topic_type: 'card',
      },
    ],
    posts: [],
    news: [],
    domains: [],
    communities: [],
  }
}
