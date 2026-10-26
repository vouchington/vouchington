import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SessionRenewal } from '@/components/auth/session-renewal'

const pendingRenewal = () => new Promise<boolean>(() => {})

const meta = {
  title: 'Auth/Session Renewal',
  component: SessionRenewal,
  args: {
    next: '/my',
    renewSession: pendingRenewal,
  },
} satisfies Meta<typeof SessionRenewal>

export default meta
type Story = StoryObj<typeof meta>

export const Renewing: Story = {}
