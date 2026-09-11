import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
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

export const HorizontalScrollArea: Story = {
  render: () => (
    <ScrollArea className='w-96 whitespace-nowrap rounded-md border'>
      <div className='flex w-max space-x-4 p-4'>
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className='w-32 shrink-0 rounded-md bg-muted p-4 text-center text-sm'
          >
            Item {i + 1}
          </div>
        ))}
      </div>
      <ScrollBar orientation='horizontal' />
    </ScrollArea>
  ),
}
