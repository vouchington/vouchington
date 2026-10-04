import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CopyrightEuGuestReceipt } from '@/components/copyright/copyright-eu-guest-receipt'

const meta = {
  title: 'Copyright/EU Guest Receipt',
  component: CopyrightEuGuestReceipt,
  args: {
    noticeId: '019f0000-0000-7000-8000-00000000e001',
    email: 'ada@example.test',
    duplicate: false,
  },
} satisfies Meta<typeof CopyrightEuGuestReceipt>

export default meta
type Story = StoryObj<typeof meta>

export const Received: Story = {}
export const AlreadyReceived: Story = { args: { duplicate: true } }
