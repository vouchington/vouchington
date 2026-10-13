import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { Spinner } from '@/components/ui/spinner'

const meta = {
  title: 'Design System/Components/Spinner',
  component: Spinner,
} satisfies Meta<typeof Spinner>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Small</span>
        <Spinner />
      </div>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Medium</span>
        <Spinner className='size-6' />
      </div>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Large</span>
        <Spinner className='size-10' />
      </div>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Decorative</span>
        <Spinner aria-hidden />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const spinners = canvas.getAllByRole('status', { name: 'Loading' })
    const decorative = canvas.getByText('Decorative').parentElement?.querySelector('svg')

    await expect(spinners).toHaveLength(3)
    await expect(spinners[0]).toHaveAttribute('data-pw', 'spinner')
    await expect(spinners[0]).toHaveClass('size-4', 'animate-spin')
    await expect(spinners[1]).toHaveClass('size-6', 'animate-spin')
    await expect(spinners[1]).not.toHaveClass('size-4')
    await expect(spinners[2]).toHaveClass('size-10')
    await expect(decorative).toHaveAttribute('aria-hidden', 'true')
    await expect(decorative).toHaveAttribute('data-pw', 'spinner')
    await expect(canvas.getAllByRole('status')).toHaveLength(3)
  },
}
