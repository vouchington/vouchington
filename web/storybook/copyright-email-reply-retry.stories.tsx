import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { CopyrightEmailReplyRetry } from '@/components/copyright/copyright-email-reply-retry'

const meta = {
  title: 'Copyright/Email Reply Retry',
  component: CopyrightEmailReplyRetry,
  args: {
    intakeId: '019f0000-0000-7000-8000-0000000000f1',
    disabled: false,
    resetQueue: fn(),
    setError: fn(),
    setSuccess: fn(),
  },
} satisfies Meta<typeof CopyrightEmailReplyRetry>

export default meta
type Story = StoryObj<typeof meta>

export const ReplyFailed: Story = {}

export const WhileAnotherActionRuns: Story = { args: { disabled: true } }
