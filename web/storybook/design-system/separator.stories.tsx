import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import type { ReactNode } from 'react'

import { Separator } from '@/components/ui/separator'

const meta = {
  title: 'Design System/Components/Separator',
  component: Separator,
} satisfies Meta<typeof Separator>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-2xl flex-col gap-6 rounded-md border p-4'>{children}</div>
  </main>
)

export const Orientations: Story = {
  render: () => (
    <Frame>
      <section className='flex flex-col gap-3'>
        <p className='text-sm font-medium'>Account settings</p>
        <Separator />
        <p className='text-sm text-muted-foreground'>Profile, identity, and privacy controls.</p>
      </section>
      <section className='flex h-20 items-center gap-4'>
        <span className='text-sm font-medium'>Profile</span>
        <Separator orientation='vertical' />
        <span className='text-sm text-muted-foreground'>Identity</span>
        <Separator orientation='vertical' />
        <span className='text-sm text-muted-foreground'>Privacy</span>
      </section>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const separators = canvasElement.querySelectorAll('[data-pw="separator"]')

    await expect(separators).toHaveLength(3)
    await expect(separators[0]).toHaveAttribute('data-orientation', 'horizontal')
    await expect(separators[1]).toHaveAttribute('data-orientation', 'vertical')
    await expect(separators[2]).toHaveAttribute('data-orientation', 'vertical')
  },
}

export const Semantic: Story = {
  render: () => (
    <Frame>
      <section
        aria-label='Security settings'
        className='flex flex-col gap-3'
      >
        <p className='text-sm font-medium'>Security</p>
        <Separator decorative={false} />
        <p className='text-sm text-muted-foreground'>
          Password, passkeys, and two-factor settings.
        </p>
      </section>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const separator = canvas.getByRole('separator')

    await expect(separator).toHaveAttribute('data-pw', 'separator')
    await expect(separator).toHaveAttribute('data-orientation', 'horizontal')
  },
}
