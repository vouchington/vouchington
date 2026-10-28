import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const tags = Array.from({ length: 50 }, (_, i) => `Tag ${i + 1}`)

const meta = {
  title: 'Design System/Components/ScrollArea',
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>

export default meta
type Story = StoryObj<typeof meta>

export const VerticalList: Story = {
  render: () => (
    <ScrollArea className='h-72 w-48 rounded-md border'>
      <div className='p-4'>
        <h4 className='mb-4 text-sm font-medium leading-none'>Tags</h4>
        {tags.map(tag => (
          <div key={tag}>
            <div className='text-sm'>{tag}</div>
            <Separator className='my-2' />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
}
