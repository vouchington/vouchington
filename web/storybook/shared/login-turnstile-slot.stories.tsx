import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { LoginTurnstileSlot } from '@/components/auth/login-turnstile-slot'

const meta = {
  title: 'Shared/LoginTurnstileSlot',
  component: LoginTurnstileSlot,
  parameters: { auth: { currentUser: null } },
} satisfies Meta<typeof LoginTurnstileSlot>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    turnstileRef: () => {},
  },
}
