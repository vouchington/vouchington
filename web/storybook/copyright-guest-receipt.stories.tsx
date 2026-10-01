import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightGuestReceipt } from '@/components/copyright/copyright-guest-receipt'

const meta = {
  title: 'Copyright/Guest Receipt',
  component: CopyrightGuestReceipt,
  args: {
    noticeId: '019f0000-0000-7000-8000-00000000c0de',
    email: 'tests+claimant@voucha.ai',
    duplicate: false,
  },
} satisfies Meta<typeof CopyrightGuestReceipt>

export default meta
type Story = StoryObj<typeof meta>

export const Received: Story = {}

export const AlreadyReceived: Story = { args: { duplicate: true } }
