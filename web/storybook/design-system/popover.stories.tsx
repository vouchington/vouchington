import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const meta = {
  title: 'Design System/Components/Popover',
  component: Popover,
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-md items-center justify-center gap-3 rounded-md border p-6'>
        <Popover defaultOpen>
          <PopoverTrigger asChild>
            <Button variant='outline'>Open popover</Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className='flex flex-col gap-2'>
              <h4 className='text-sm font-semibold'>Quick info</h4>
              <p className='text-sm text-muted-foreground'>
                Popovers attach to a trigger and float above the page content.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </main>
  ),
}
