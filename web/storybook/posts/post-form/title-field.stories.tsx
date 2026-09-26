import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TitleField } from '@/components/posts/post-form/title-field'
import { StoryFrame } from '@/storybook/story-frame'
import { reviewPost } from '../fixtures'

const meta = {
  title: 'Posts/Title Field',
  component: TitleField,
} satisfies Meta

export default meta
type Story = StoryObj

function TitleStory({ contentLocked, title }: { contentLocked: boolean; title: string }) {
  const [value, setValue] = useState(title)
  return (
    <StoryFrame width='max-w-xl'>
      <TitleField
        contentLocked={contentLocked}
        title={value}
        setTitle={setValue}
      />
    </StoryFrame>
  )
}

export const Editable: Story = {
  render: () => (
    <TitleStory
      contentLocked={false}
      title={reviewPost.title}
    />
  ),
}

export const Locked: Story = {
  render: () => (
    <TitleStory
      contentLocked
      title={reviewPost.title}
    />
  ),
}
