import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { SubmitLinkForm } from '@/components/posts/submit-link-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Posts/Submit Link Form',
  component: SubmitLinkForm,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj

function LinkPreview() {
  const [href, setHref] = useState<string | null>(null)
  return (
    <StoryFrame width='max-w-xl'>
      {href ? <p>{href}</p> : <SubmitLinkForm onCreated={setHref} />}
    </StoryFrame>
  )
}

export const Empty: Story = {
  render: () => <LinkPreview />,
}
