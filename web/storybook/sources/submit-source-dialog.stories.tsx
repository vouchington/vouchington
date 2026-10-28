import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { SubmitSourceButton } from '@/components/sources/submit-source-dialog'
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
export const Button: Story = {
  render: () => (
    <StoryFrame>
      <SubmitSourceButton />
    </StoryFrame>
  ),
}

export const Open: Story = {
  render: () => <SubmitSourceButton />,
  play: async () => {
    const canvas = within(document.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Submit Source' }))
    const dialog = canvas.getByRole('dialog', { name: 'Submit a Source' })
    await userEvent.type(within(dialog).getByRole('textbox'), 'https://example.com/feed.xml')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Submit Source' }))
    await expect(canvas.queryByRole('dialog', { name: 'Submit a Source' })).toBeNull()
  },
}
