import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

const meta = {
  title: 'Design System/Components/Kbd',
  component: Kbd,
} satisfies Meta<typeof Kbd>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-4 rounded-md border p-4'>{children}</div>
  </main>
)

export const Shortcuts: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center justify-between gap-3 text-sm'>
        <span>Search</span>
        <KbdGroup className='ml-auto shrink-0'>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </div>
      <div className='flex items-center justify-between gap-3 text-sm'>
        <span>Toggle sidebar</span>
        <Kbd className='ml-4 shrink-0'>⌘/</Kbd>
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const group = canvas.getByText('⌘').parentElement
    const sidebarShortcut = canvas.getByText('⌘/')

    await expect(group).toHaveAttribute('data-slot', 'kbd-group')
    await expect(group).toHaveAttribute('data-pw', 'kbd-group')
    await expect(group?.tagName).toBe('KBD')
    await expect(canvas.getByText('⌘')).toHaveAttribute('data-slot', 'kbd')
    await expect(canvas.getByText('⌘')).toHaveAttribute('data-pw', 'kbd')
    await expect(canvas.getByText('K')).toHaveClass('bg-muted', 'font-sans')
    await expect(sidebarShortcut).toHaveAttribute('data-pw', 'kbd')
    await expect(sidebarShortcut).toHaveClass('font-sans')
  },
}

export const ButtonHints: Story = {
  render: () => (
    <Frame>
      <div className='flex gap-2'>
        <Button
          type='button'
          variant='destructive'
          size='sm'
        >
          Reject{' '}
          <Kbd
            className='ml-1'
            aria-hidden='true'
          >
            R
          </Kbd>
        </Button>
        <Button
          type='button'
          size='sm'
        >
          Approve{' '}
          <Kbd
            className='ml-1'
            aria-hidden='true'
          >
            A
          </Kbd>
        </Button>
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const reject = canvas.getByRole('button', { name: 'Reject' })
    const approve = canvas.getByRole('button', { name: 'Approve' })

    await expect(reject).toBeVisible()
    await expect(approve).toBeVisible()
    await expect(reject.querySelector('[data-pw="kbd"]')).toHaveTextContent('R')
    await expect(approve.querySelector('[data-pw="kbd"]')).toHaveAttribute('aria-hidden', 'true')
  },
}
