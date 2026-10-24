import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CopyrightEmailLegalProcessAction } from '@/components/copyright/copyright-email-legal-process-action'

const meta = {
  title: 'Copyright/Email Legal Process Action',
  component: CopyrightEmailLegalProcessAction,
  args: {
    detail: { id: '019f0000-0000-7000-8000-0000000000a1', review_path: 'initial' },
    disabled: false,
    onRecorded: fn(),
  },
} satisfies Meta<typeof CopyrightEmailLegalProcessAction>

export default meta
type Story = StoryObj<typeof meta>

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Record as legal process' })).toBeEnabled()
  },
}

export const ConfirmingWithReason: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Record as legal process' }))
    await expect(canvas.getByRole('button', { name: 'Confirm legal process' })).toBeDisabled()
    await userEvent.type(canvas.getByLabelText('Legal process reason'), 'Subpoena for records')
    await expect(canvas.getByRole('button', { name: 'Confirm legal process' })).toBeEnabled()
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))
    await expect(canvas.getByRole('button', { name: 'Record as legal process' })).toBeVisible()
  },
}

export const DisabledWhileAnotherActionRuns: Story = {
  args: { disabled: true },
}
