import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { Progress } from '@/components/ui/progress'

const meta = {
  title: 'Design System/Components/Progress',
  component: Progress,
} satisfies Meta<typeof Progress>

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
      <div className='flex flex-col gap-1'>
        <span className='font-mono text-xs text-muted-foreground'>Empty</span>
        <Progress
          value={0}
          aria-label='Empty'
        />
      </div>
      <div className='flex flex-col gap-1'>
        <span className='font-mono text-xs text-muted-foreground'>Halfway</span>
        <Progress
          value={50}
          aria-label='Halfway'
        />
      </div>
      <div className='flex flex-col gap-1'>
        <span className='font-mono text-xs text-muted-foreground'>Complete</span>
        <Progress
          value={100}
          aria-label='Complete'
        />
      </div>
      <div className='flex flex-col gap-1'>
        <span className='font-mono text-xs text-muted-foreground'>Thin</span>
        <Progress
          value={50}
          aria-label='Thin'
          className='h-1'
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const empty = canvas.getByRole('progressbar', { name: 'Empty' })
    const halfway = canvas.getByRole('progressbar', { name: 'Halfway' })
    const complete = canvas.getByRole('progressbar', { name: 'Complete' })
    const thin = canvas.getByRole('progressbar', { name: 'Thin' })
    const halfwayIndicator = halfway.querySelector('[data-slot="progress-indicator"]')
    const emptyIndicator = empty.querySelector('[data-slot="progress-indicator"]')

    await expect(empty).toHaveAttribute('data-pw', 'progress')
    await expect(empty).toHaveAttribute('data-slot', 'progress')
    await expect(empty).toHaveAttribute('aria-valuenow', '0')
    await expect(empty).toHaveAttribute('aria-valuemin', '0')
    await expect(empty).toHaveAttribute('aria-valuemax', '100')
    await expect(emptyIndicator?.getAttribute('style')).toContain('translateX(-100%)')
    await expect(halfway).toHaveAttribute('aria-valuenow', '50')
    await expect(halfwayIndicator?.getAttribute('style')).toContain('translateX(-50%)')
    await expect(complete).toHaveAttribute('aria-valuenow', '100')
    await expect(thin).toHaveClass('h-1', 'bg-primary/20')
    await expect(thin).not.toHaveClass('h-2')
  },
}
