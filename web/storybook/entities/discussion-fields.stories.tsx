import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { DiscussionFields } from '@/components/posts/discussion-fields'
import { EntityStoryFrame } from './entity-story-frame'
import { topics } from './entity-fixtures'

const meta = {
  title: 'Entities/DiscussionFields',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const TopicAndHashtag: Story = {
  render: () => (
    <EntityStoryFrame title='Discussion categories'>
      <DiscussionFields
        categories={[
          {
            key: 'travel-topic',
            topicId: topics[0]!.id,
            topicName: topics[0]!.name,
            hashtag: '',
          },
          {
            key: 'travel-deals-hashtag',
            topicId: '',
            topicName: '',
            hashtag: '#travel-deals',
          },
        ]}
        onAddCategory={() => {}}
        onCategoryChange={() => {}}
        onHashtagChange={() => {}}
        onMoveCategory={() => {}}
        onRemoveCategory={() => {}}
        pendingFocusIndexRef={{ current: null }}
      />
    </EntityStoryFrame>
  ),
}
