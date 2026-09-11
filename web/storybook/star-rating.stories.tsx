import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useArgs } from 'storybook/preview-api'
import { expect, fn, userEvent, within } from 'storybook/test'

import { StarRating } from '@/components/posts/star-rating'

const meta = {
  title: 'Posts/Star Rating',
  component: StarRating,
  args: {
    rating: 2,
    onChange: fn(),
    label: 'Review quality',
  },
  decorators: [
    Story => (
      <main className='bg-background p-6 text-foreground'>
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof StarRating>

export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {
  render: function Render(args) {
    const [, updateArgs] = useArgs()

    return (
      <StarRating
        {...args}
        onChange={nextRating => {
          updateArgs({ rating: nextRating })
          args.onChange(nextRating)
        }}
      />
    )
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    const fiveStars = canvas.getByRole('radio', { name: '5 stars' })

    await userEvent.click(fiveStars)
    await expect(args.onChange).toHaveBeenCalledWith(5)
  },
}
