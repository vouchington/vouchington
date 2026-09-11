import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const meta = {
  title: 'Design System/Components/Label',
  component: Label,
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-md flex-col gap-3 rounded-md border p-3'>{children}</div>
  </main>
)

export const AssociatedInput: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Label htmlFor='label-email'>Email address</Label>
        <Input
          id='label-email'
          data-testid='label-email-input'
          type='email'
          placeholder='you@example.com'
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement)
    const label = canvas.getByText('Email address')
    const input = canvas.getByTestId('label-email-input')

    await expect(label).toHaveAttribute('for', 'label-email')
    await expect(label).toHaveAttribute('id', 'label-email-label')

    await userEvent.click(label)
    await expect(input).toHaveFocus()
  },
}

export const DisabledPeer: Story = {
  render: () => (
    <Frame>
      <div className='flex flex-col gap-1'>
        <Input
          id='label-disabled'
          className='peer'
          disabled
          placeholder='Unavailable'
        />
        <Label htmlFor='label-disabled'>Disabled field</Label>
      </div>
    </Frame>
  ),
}
