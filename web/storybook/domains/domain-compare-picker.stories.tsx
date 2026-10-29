import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { DomainComparePicker } from '@/components/domains/domain-compare-picker'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Domains/Compare Picker',
  component: DomainComparePicker,
  render: args => (
    <StoryFrame width='max-w-2xl'>
      <DomainComparePicker {...args} />
    </StoryFrame>
  ),
} satisfies Meta<typeof DomainComparePicker>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: { initialHostnames: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByPlaceholderText('Search hostnames')).toHaveValue('')
    await expect(canvas.getByRole('button', { name: 'Compare hostnames' })).toBeDisabled()
  },
}

export const SelectedHostnames: Story = {
  args: { initialHostnames: ['example.com', 'test.org'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'example.com ×' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'test.org ×' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Compare hostnames' })).toBeEnabled()
  },
}
