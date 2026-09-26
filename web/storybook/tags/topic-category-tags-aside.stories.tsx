import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicCategoryTagsAside } from '@/components/tags/topic-category-tags-aside'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!

const meta = {
  title: 'Tags/Topic Category Tags Aside',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Authenticated: Story = {
  render: () => (
    <StoryFrame>
      <TopicCategoryTagsAside
        topic={topic}
        isAuthenticated
      />
    </StoryFrame>
  ),
}

export const SignedOut: Story = {
  parameters: { auth: { currentUser: null } },
  render: () => (
    <StoryFrame>
      <TopicCategoryTagsAside
        topic={topic}
        isAuthenticated={false}
      />
    </StoryFrame>
  ),
}
