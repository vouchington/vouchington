import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'Design System/Components/Button/Loading',
  component: Button,
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Loading: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-wrap items-center gap-2'>
        <Button loading>Saving...</Button>
        <Button
          loading
          variant='outline'
        >
          Uploading...
        </Button>
        <Button
          loading
          variant='secondary'
        >
          Processing...
        </Button>
      </div>
    </Frame>
  ),
}

export const LoadingDestructive: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          loading
          variant='destructive'
        >
          Deleting...
        </Button>
      </div>
    </Frame>
  ),
}

export const LoadingIconOnly: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-2'>
        <Button
          loading
          size='icon'
          aria-label='Loading action'
        />
        <Button
          loading
          size='touchIcon'
          aria-label='Touch loading action'
        />
      </div>
    </Frame>
  ),
}

export const LoadingAsChildIgnored: Story = {
  name: 'Loading ignored for asChild',
  render: () => (
    <Frame>
      <p className='text-xs text-muted-foreground'>
        loading prop is ignored when asChild — no spinner injected, Slot receives single child:
      </p>
      <Button
        asChild
        loading
      >
        {/* oxlint-disable-next-line next/no-html-link-for-pages -- Storybook demo, no Next.js router */}
        <a href='/'>Link with loading prop (no spinner)</a>
      </Button>
    </Frame>
  ),
}
