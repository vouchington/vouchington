import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'

const meta = {
  title: 'Design System/Components/Toaster',
  component: Toaster,
} satisfies Meta<typeof Toaster>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='flex flex-wrap gap-2'>
        <Button onClick={() => toast.success('Saved your changes')}>Success toast</Button>
        <Button
          variant='destructive'
          onClick={() => toast.error('Something went wrong')}
        >
          Error toast
        </Button>
        <Button
          variant='outline'
          onClick={() => toast('Heads up', { description: 'A neutral message' })}
        >
          Message toast
        </Button>
      </div>
      <Toaster />
    </main>
  ),
}
