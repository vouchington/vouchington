import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const meta = {
  title: 'Design System/Components/Select',
  component: Select,
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='select-default'>Sort by</Label>
        <Select defaultValue='new'>
          <SelectTrigger id='select-default'>
            <SelectValue placeholder='Pick an option' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='new'>New</SelectItem>
            <SelectItem value='best'>Best</SelectItem>
            <SelectItem value='relevance'>Relevance</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Frame>
  ),
}

export const WithGroups: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='select-grouped'>Filter</Label>
        <Select defaultValue='discussion'>
          <SelectTrigger id='select-grouped'>
            <SelectValue placeholder='Pick a kind' />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Posts</SelectLabel>
              <SelectItem value='discussion'>Discussion</SelectItem>
              <SelectItem value='review'>Review</SelectItem>
              <SelectItem value='data_point'>Data point</SelectItem>
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>News</SelectLabel>
              <SelectItem value='story'>Story</SelectItem>
              <SelectItem value='article'>Article</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </Frame>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='select-disabled'>Disabled select</Label>
        <Select
          disabled
          defaultValue='locked'
        >
          <SelectTrigger id='select-disabled'>
            <SelectValue placeholder='Pick an option' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='locked'>Locked</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </Frame>
  ),
}
