import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PostContinuationItem } from '@/components/command-search/post-continuation-item'
import { Command, CommandList } from '@/components/ui/command'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Command Search/Post Continuation',
  component: PostContinuationItem,
  args: { onLoadMore: fn(), loading: false, hasError: false },
  decorators: [
    Story => (
      <StoryFrame width='max-w-xl'>
        <Command
          shouldFilter={false}
          label='Search results'
        >
          <CommandList>
            <Story />
          </CommandList>
        </Command>
      </StoryFrame>
    ),
  ],
} satisfies Meta<typeof PostContinuationItem>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('option', { name: 'Load more' }))
    await expect(args.onLoadMore).toHaveBeenCalledOnce()
  },
}
export const Loading: Story = { args: { loading: true } }
export const Error: Story = { args: { hasError: true } }
