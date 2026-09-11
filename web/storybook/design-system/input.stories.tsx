import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Search as SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const meta = {
  title: 'Design System/Components/Input',
  component: Input,
} satisfies Meta<typeof Input>

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
      <Input placeholder='Type here…' />
    </Frame>
  ),
}

export const WithLabel: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='input-with-label'>Email address</Label>
        <Input
          id='input-with-label'
          type='email'
          placeholder='you@example.com'
        />
      </div>
    </Frame>
  ),
}

export const Error: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label
          htmlFor='input-error'
          className='text-destructive'
        >
          Username *
        </Label>
        <Input
          id='input-error'
          className='border-destructive'
          defaultValue='nope!'
          aria-invalid='true'
          aria-describedby='input-error-message'
        />
        <p
          id='input-error-message'
          className='text-xs text-destructive'
        >
          This field is required.
        </p>
      </div>
    </Frame>
  ),
}

export const Disabled: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='input-disabled'>Disabled input</Label>
        <Input
          id='input-disabled'
          placeholder='Cannot edit'
          disabled
        />
      </div>
    </Frame>
  ),
}

export const Search: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='input-search'>Search</Label>
        <div className='relative'>
          <SearchIcon className='pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            id='input-search'
            type='search'
            placeholder='Search…'
            className='pl-8'
          />
        </div>
      </div>
    </Frame>
  ),
}

export const TypeInteraction: Story = {
  render: () => (
    <Frame>
      <Input
        data-testid='type-target'
        placeholder='Type here…'
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByTestId('type-target')
    await userEvent.clear(input)
    await userEvent.type(input, 'hello')
    await expect(input).toHaveValue('hello')
  },
}
