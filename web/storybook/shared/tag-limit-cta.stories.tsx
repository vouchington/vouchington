import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TagLimitCta } from '@/components/tags/tag-limit-cta'

const meta = {
  title: 'Shared/TagLimitCta',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='bg-background p-6 text-foreground'>
      <div className='max-w-sm'>
        <TagLimitCta />
      </div>
    </main>
  ),
}
