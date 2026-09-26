import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AddSourceForm } from '@/components/sources/add-source-form'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Sources/Add Source Form',
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const News: Story = {
  render: () => (
    <StoryFrame>
      <AddSourceForm
        kind='news'
        onSuccess={() => undefined}
      />
    </StoryFrame>
  ),
}

export const Video: Story = {
  render: () => (
    <StoryFrame>
      <AddSourceForm
        kind='video'
        onSuccess={() => undefined}
      />
    </StoryFrame>
  ),
}
