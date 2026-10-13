import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Skeleton as SkeletonPrimitive } from '@/components/ui/skeleton'

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
