import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BrowseFeedResults } from '@/components/sources/browse-feed-results'
import { useTranslations } from '@/lib/i18n/use-translations'
import { StoryFrame } from '@/storybook/story-frame'
import { rssFeeds } from '@/storybook/entities/fixtures/feeds'

const meta = {
  title: 'Sources/BrowseFeedResults',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const emptyFeeds = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  topic_elections: {},
  hostname_elections: {},
  bookmarks: {},
  election_votes: {},
}

function Results({
  q,
  searchError,
  feeds,
}: {
  q?: string
  searchError: string | null
  feeds: typeof emptyFeeds | null
}) {
  const t = useTranslations()
  return (
    <BrowseFeedResults
      listTestId='channels-list'
      t={t}
      q={q}
      searchError={searchError}
      feeds={feeds}
      emptyTitleKey='extracted.channels.page.noChannelsFound_86350898'
      emptySearchKey='extracted.channels.page.noChannelsMatchYourSearchTry_c640eb88'
      emptyDefaultKey='extracted.channels.page.noVideoChannelsHaveBeenAdded_19eb06b1'
      includeHostnameElections
    />
  )
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <Results
        searchError={null}
        feeds={emptyFeeds}
      />
    </StoryFrame>
  ),
}

export const SearchError: Story = {
  render: () => (
    <StoryFrame>
      <Results
        q='channels'
        searchError='Invalid search parameters'
        feeds={null}
      />
    </StoryFrame>
  ),
}

export const Channels: Story = {
  render: () => (
    <StoryFrame>
      <Results
        searchError={null}
        feeds={{
          ...emptyFeeds,
          results: [rssFeeds[0], rssFeeds[2]],
        }}
      />
    </StoryFrame>
  ),
}
