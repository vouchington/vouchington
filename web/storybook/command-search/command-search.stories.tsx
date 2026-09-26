import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { CommandSearch } from '@/components/command-search'
import { clientApi } from '@/lib/api/client/instance'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'
import { StoryFrame } from '@/storybook/story-frame'
import { searchResults } from './search-story-data'

const combinedSearchPayload = {
  topics: searchResults.topics.slice(0, 2).map(topic => ({
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    topic_type: topic.topic_type,
  })),
  posts: searchResults.posts.slice(0, 1).map(post => ({
    id: post.id,
    post_type: post.post_type,
    title: post.title ?? 'Sapphire Reserve review',
    authored_title: post.title,
    declared_language: post.declared_language,
    lingua_rs_detected_language: post.lingua_rs_detected_language,
  })),
  news: searchResults.news.slice(0, 1).map(item => ({
    id: item.id,
    url: item.url.url,
    title: item.data.title,
    feed_title: item.rss_feed.title,
  })),
  domains: searchResults.domains.slice(0, 1).map(domain => ({
    id: domain.id,
    hostname: domain.hostname,
  })),
  communities: searchResults.communities.slice(0, 1).map(community => ({
    id: community.id,
    name: community.name,
    slug: community.slug,
    bookmarked: false,
  })),
}

const meta = {
  title: 'Command Search/Command Search',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function installSearchStub() {
  const originalGet = clientApi.get
  const topic = searchResults.topics.find(item => item.name === 'Sapphire Reserve')
  clientApi.get = (async (endpoint: string) => {
    if (endpoint.startsWith('/api/v1/search')) return combinedSearchPayload
    if (endpoint.startsWith('/api/v1/topics') && topic) {
      return { results: [{ id: topic.id }], topics: { [topic.id]: topic } }
    }
    return {
      results: [],
      posts: {},
      rss_feed_items: {},
      hostnames: {},
      communities: {},
      bookmarks: {},
      buckets: [],
    }
  }) as typeof clientApi.get
  return () => {
    clientApi.get = originalGet
  }
}

function SearchPreview({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <StoryFrame>
      <FeatureFlagsProvider globalFlags={{ combinedSearch: true }}>
        <CommandSearch
          open
          onOpenChange={() => {}}
          isAdmin={false}
          isAuthenticated={isAuthenticated}
        />
      </FeatureFlagsProvider>
    </StoryFrame>
  )
}

async function showSapphireResults({ canvasElement }: { canvasElement: HTMLElement }) {
  const restore = installSearchStub()
  try {
    const doc = canvasElement.ownerDocument
    const input = doc.querySelector<HTMLInputElement>('[data-pw="search-input"]')
    if (!input) throw new Error('missing search input')
    await userEvent.type(input, 'Sapphire')
    await within(doc.body).findByText('Sapphire Reserve', {}, { timeout: 3000 })
  } finally {
    restore()
  }
}

export const SapphireReserve: Story = {
  render: () => <SearchPreview isAuthenticated />,
  play: showSapphireResults,
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => <SearchPreview isAuthenticated={false} />,
  play: showSapphireResults,
}
