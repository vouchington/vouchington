import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { TopHashtagRow } from '@/components/topic-recommendations/top-hashtag-row'
import type { TopHashtag } from '@/lib/api/client/topic-recommendations'
import { StoryFrame } from '@/storybook/story-frame'

const hashtag: TopHashtag = {
  topic_alias_id: '00000000-0000-7000-8000-000000000103',
  hashtag: '#Credit-Cards',
  item_count: 6,
  contributor_count: 3,
  latest_content_id: '00000000-0000-7000-8000-000000000104',
  topic_id: null,
}

const meta = {
  title: 'Topic Recommendations/Top Hashtag Row',
  component: TopHashtagRow,
} satisfies Meta<typeof TopHashtagRow>

export default meta
type Story = StoryObj<typeof meta>

export const UnlinkedAdminRow: Story = {
  args: {
    isAdmin: true,
    item: hashtag,
    linkedTopic: undefined,
    onStartLink: fn(),
    onUnlink: fn(),
  },
  render: args => (
    <StoryFrame>
      <ul>
        <TopHashtagRow {...args} />
      </ul>
    </StoryFrame>
  ),
}
