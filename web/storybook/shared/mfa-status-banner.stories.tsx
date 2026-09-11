import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MfaStatusBanner } from '@/components/my/mfa-status-banner'

const meta = {
  title: 'Shared/MfaStatusBanner',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const MfaOff: Story = {
  render: () => (
    <main className='bg-background p-6 text-foreground'>
      <MfaStatusBanner mfaStatus={{ has_mfa: false, passkeys_count: 0, totp_count: 0 }} />
    </main>
  ),
}

export const MfaOn: Story = {
  render: () => (
    <main className='bg-background p-6 text-foreground'>
      <MfaStatusBanner mfaStatus={{ has_mfa: true, passkeys_count: 1, totp_count: 0 }} />
    </main>
  ),
}
