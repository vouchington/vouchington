import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopHashtags } from '@/components/topic-recommendations/top-hashtags'
import { TopHashtagFilters } from '@/components/topic-recommendations/top-hashtag-filters'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/TopHashtags',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Admin: Story = {
  render: () => (
    <EntityStoryFrame title='Top hashtags'>
      <TopHashtags
        isAdmin
        initialData={{
          results: [
            {
              topic_alias_id: '00000000-0000-7000-8000-000000000101',
              hashtag: '#Travel',
              item_count: 12,
              contributor_count: 4,
              latest_content_id: '00000000-0000-7000-8000-000000000102',
              topic_id: 'topic-1',
            },
            {
              topic_alias_id: '00000000-0000-7000-8000-000000000103',
              hashtag: '#Credit-Cards',
              item_count: 6,
              contributor_count: 3,
              latest_content_id: '00000000-0000-7000-8000-000000000104',
              topic_id: null,
            },
          ],
          topics: {
            'topic-1': { id: 'topic-1', name: 'Travel', slug: 'travel', topic_type: 'topic' },
          },
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }}
      />
    </EntityStoryFrame>
  ),
}

export const Filters: Story = {
  render: () => (
    <EntityStoryFrame title='Top hashtag filters'>
      <TopHashtagFilters
        mapping='all'
        onQueryChange={() => {}}
        onSearch={() => {}}
        query='travel-deals'
      />
    </EntityStoryFrame>
  ),
}
