import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import MfaStep from '@/components/auth/mfa-step'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Auth/MFA Step',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AuthenticatorOrPasskey: Story = {
  render: () => (
    <StoryFrame width='max-w-sm'>
      <h1 className='mb-4 text-2xl font-bold'>Verify it is you</h1>
      <MfaStep
        loginAttemptId='login-attempt-cardholder'
        onSuccess={() => {}}
        onBack={() => {}}
      />
    </StoryFrame>
  ),
}
