import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
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
const onNewsSuccess = fn<() => void>()

export const News: Story = {
  render: () => (
    <StoryFrame>
      <AddSourceForm
        kind='news'
        onSuccess={onNewsSuccess}
      />
    </StoryFrame>
  ),
  play: async ({ canvasElement }) => {
    const completed = Promise.withResolvers<void>()
    onNewsSuccess.mockClear()
    onNewsSuccess.mockImplementation(() => {
      completed.resolve()
    })
    const canvas = within(canvasElement)
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Feed URL' }),
      'https://example.com/feed.xml',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Add News Source' }))
    await completed.promise
    await expect(onNewsSuccess).toHaveBeenCalledOnce()
  },
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
