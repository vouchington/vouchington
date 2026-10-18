import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { SubmitSourceButton, SubmitSourceDialog } from '@/components/sources/submit-source-dialog'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Sources/Submit Source Dialog',
  beforeEach() {
    setStoryMutationFixture()
    return () => {
      clearStoryMutationFixture()
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>
const onOpenChange = fn<(open: boolean) => void>()

export const Button: Story = {
  render: () => (
    <StoryFrame>
      <SubmitSourceButton />
    </StoryFrame>
  ),
}

export const Open: Story = {
  render: () => (
    <StoryFrame>
      <SubmitSourceDialog
        open
        onOpenChange={onOpenChange}
      />
    </StoryFrame>
  ),
  play: async () => {
    const completed = Promise.withResolvers<void>()
    onOpenChange.mockClear()
    onOpenChange.mockImplementation(open => {
      if (!open) completed.resolve()
    })
    const dialog = within(document.body).getByRole('dialog', { name: 'Submit a Source' })
    await userEvent.type(within(dialog).getByRole('textbox'), 'https://example.com/feed.xml')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit Source' }))
    await completed.promise
    await expect(onOpenChange).toHaveBeenCalledWith(false)
  },
}
