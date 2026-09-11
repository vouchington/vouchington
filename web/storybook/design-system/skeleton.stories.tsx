import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton'

// NOTE: `@/components/ui/spinner` is not installed. The shared inline spinner
// pattern (used in components-showcase.tsx) is reproduced below: a small div
// with `animate-spin` and a partial border.

const meta = {
  title: 'Design System/Components/Skeleton',
  component: SkeletonPrimitive,
} satisfies Meta<typeof SkeletonPrimitive>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Skeleton: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-2'>
        <SkeletonPrimitive className='h-4 w-48' />
        <SkeletonPrimitive className='h-4 w-64' />
        <SkeletonPrimitive className='h-4 w-32' />
      </div>
      <div className='flex items-center gap-3'>
        <SkeletonPrimitive className='h-10 w-10 rounded-full' />
        <div className='flex flex-col gap-2'>
          <SkeletonPrimitive className='h-3 w-32' />
          <SkeletonPrimitive className='h-3 w-24' />
        </div>
      </div>
    </Frame>
  ),
}

export const Spinner: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Small</span>
        <div className='h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground' />
      </div>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Medium</span>
        <div className='h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground' />
      </div>
      <div className='flex items-center gap-3'>
        <span className='font-mono text-xs text-muted-foreground'>Large</span>
        <div className='h-10 w-10 animate-spin rounded-full border-4 border-muted-foreground/30 border-t-muted-foreground' />
      </div>
    </Frame>
  ),
}
