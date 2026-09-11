import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const meta = {
  title: 'Design System/Components/Tooltip',
  component: Tooltip,
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto flex max-w-md items-center justify-center gap-3 rounded-md border p-6'>
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger asChild>
              <Button variant='outline'>Hover me</Button>
            </TooltipTrigger>
            <TooltipContent side='top'>Helpful hint about this action.</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </main>
  ),
}
