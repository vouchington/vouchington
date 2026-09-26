import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ListItemRow } from '@/components/lists/list-item-row'
import type { ListItem } from '@/types/api-responses'
import { newsItems } from '@/storybook/entities/fixtures/feeds'
import { posts } from '@/storybook/entities/fixtures/posts'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Lists/List Item Row',
  component: ListItemRow,
} satisfies Meta<typeof ListItemRow>

export default meta
type Story = StoryObj<typeof meta>

const review: ListItem = {
  __entity_type: 'list_item',
  id: 'list-item-sapphire-review',
  list_id: 'list-card-picks',
  item_type: 'post',
  entity_id: posts[1]!.id,
  order_index: 0,
  created_at: posts[1]!.created_at,
  media_type: null,
}

const episode: ListItem = {
  __entity_type: 'list_item',
  id: 'list-item-points-podcast',
  list_id: 'list-card-picks',
  item_type: 'rss_feed_item',
  entity_id: newsItems[1]!.id,
  order_index: 1,
  created_at: newsItems[1]!.published_at,
  media_type: 'audio',
}

export const Review: Story = {
  args: { item: review },
  render: args => (
    <StoryFrame>
      <ListItemRow {...args} />
    </StoryFrame>
  ),
}

export const Podcast: Story = {
  args: { item: episode },
  render: args => (
    <StoryFrame>
      <ListItemRow {...args} />
    </StoryFrame>
  ),
}
