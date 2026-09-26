import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TotpManager } from '@/components/my/totp-manager'
import { StoryFrame } from '@/storybook/story-frame'
import type { TotpAuthenticator } from '@/types/user'

const meta = {
  title: 'My/Totp Manager',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

const authenticators: TotpAuthenticator[] = [
  {
    id: '019f38fe-0000-7000-8000-0000000000t1',
    name: '1Password',
    created_at: '2026-04-01T12:00:00.000Z',
  },
]

export const WithAuthenticator: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <TotpManager
        initialData={{ results: authenticators, page_info: pageInfo }}
        mfaStatus={{ has_mfa: true, passkeys_count: 1, totp_count: 1 }}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <TotpManager
        initialData={{ results: [], page_info: pageInfo }}
        mfaStatus={{ has_mfa: false, passkeys_count: 0, totp_count: 0 }}
      />
    </StoryFrame>
  ),
}
