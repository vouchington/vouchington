import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Bold, Italic, Underline } from 'lucide-react'
import { expect, userEvent, within } from 'storybook/test'

import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const meta = {
  title: 'Design System/Components/Toggle',
  component: Toggle,
} satisfies Meta<typeof Toggle>

export default meta
type Story = StoryObj<typeof meta>

export const Simple: Story = {
  render: () => (
    <Toggle aria-label='Toggle bold'>
      <Bold className='h-4 w-4' />
    </Toggle>
  ),
}

export const Outline: Story = {
  render: () => (
    <Toggle
      variant='outline'
      aria-label='Toggle italic'
    >
      <Italic className='h-4 w-4' />
    </Toggle>
  ),
}

export const WithText: Story = {
  render: () => (
    <Toggle aria-label='Toggle italic'>
      <Italic className='h-4 w-4' />
      Italic
    </Toggle>
  ),
}

export const Group: Story = {
  render: () => (
    <ToggleGroup type='multiple'>
      <ToggleGroupItem
        value='bold'
        aria-label='Toggle bold'
      >
        <Bold className='h-4 w-4' />
      </ToggleGroupItem>
      <ToggleGroupItem
        value='italic'
        aria-label='Toggle italic'
      >
        <Italic className='h-4 w-4' />
      </ToggleGroupItem>
      <ToggleGroupItem
        value='underline'
        aria-label='Toggle underline'
      >
        <Underline className='h-4 w-4' />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bold = canvas.getByRole('button', { name: 'Toggle bold' })
    const italic = canvas.getByRole('button', { name: 'Toggle italic' })

    await expect(bold).toHaveAttribute('data-state', 'off')
    await expect(bold).toHaveAttribute('aria-pressed', 'false')
    await expect(italic).toHaveAttribute('data-state', 'off')
    await expect(italic).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(bold)
    await userEvent.click(italic)
    await expect(bold).toHaveAttribute('data-state', 'on')
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    await expect(italic).toHaveAttribute('data-state', 'on')
    await expect(italic).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(bold)
    await expect(bold).toHaveAttribute('data-state', 'off')
    await expect(bold).toHaveAttribute('aria-pressed', 'false')
    await expect(italic).toHaveAttribute('data-state', 'on')
    await expect(italic).toHaveAttribute('aria-pressed', 'true')
  },
}

export const GroupSingle: Story = {
  render: () => (
    <ToggleGroup
      type='single'
      defaultValue='center'
    >
      <ToggleGroupItem value='left'>Left</ToggleGroupItem>
      <ToggleGroupItem value='center'>Center</ToggleGroupItem>
      <ToggleGroupItem value='right'>Right</ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const left = canvas.getByRole('radio', { name: 'Left' })
    const center = canvas.getByRole('radio', { name: 'Center' })

    await expect(center).toHaveAttribute('data-state', 'on')
    await expect(center).toBeChecked()
    await expect(left).toHaveAttribute('data-state', 'off')
    await expect(left).not.toBeChecked()

    await userEvent.click(left)
    await expect(left).toHaveAttribute('data-state', 'on')
    await expect(left).toBeChecked()
    await expect(center).toHaveAttribute('data-state', 'off')
    await expect(center).not.toBeChecked()
  },
}
