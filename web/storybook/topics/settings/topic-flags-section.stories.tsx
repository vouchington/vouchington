import type { FormEvent } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TopicFlagsSection } from '@/components/topics/settings/topic-flags-section'
import { StoryFrame } from '@/storybook/story-frame'

const prevent = (event: FormEvent) => event.preventDefault()

const meta = {
  title: 'Topics/Topic Flags',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ReviewsAllowed: Story = {
  render: () => (
    <StoryFrame>
      <TopicFlagsSection
        noindex={false}
        allowReviews
        flagsSaving={false}
        onFlagsSubmit={prevent}
        setNoindex={() => undefined}
        setAllowReviews={() => undefined}
      />
    </StoryFrame>
  ),
}

export const HiddenFromSearch: Story = {
  render: () => (
    <StoryFrame>
      <TopicFlagsSection
        noindex
        allowReviews={false}
        flagsSaving={false}
        onFlagsSubmit={prevent}
        setNoindex={() => undefined}
        setAllowReviews={() => undefined}
      />
    </StoryFrame>
  ),
}
