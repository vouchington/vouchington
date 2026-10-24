import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { VouchaIcon, VouchaLogo } from '@/components/brand/voucha-logo'
import { VouchaMarkIcon, VouchaWordmarkIcon } from '@/components/icons/voucha-brand-icons'

const meta = {
  title: 'Design System/Brand',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const LogoMarks: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-md items-center gap-4 rounded-md border p-4'>
        <VouchaLogo className='h-6 w-auto' />
        <VouchaIcon className='h-8 w-8' />
      </div>
    </main>
  ),
}

export const InlineSvgIcons: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-md items-center gap-4 rounded-md border p-4'>
        <VouchaWordmarkIcon className='h-6 w-auto' />
        <VouchaMarkIcon className='h-8 w-8' />
      </div>
    </main>
  ),
}
