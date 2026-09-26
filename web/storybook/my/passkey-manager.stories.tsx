import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PasskeyManager } from '@/components/my/passkey-manager'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { Passkey } from '@/types/user'

const meta = {
  title: 'My/Passkey Manager',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

const passkeys: Passkey[] = [
  {
    id: '019f38fe-0000-7000-8000-0000000000p1',
    name: 'MacBook Pro',
    device_type: 'multiDevice',
    backed_up: true,
    created_at: '2026-03-12T12:00:00.000Z',
    last_used_at: '2026-09-20T16:00:00.000Z',
  },
  {
    id: '019f38fe-0000-7000-8000-0000000000p2',
    name: 'YubiKey',
    device_type: 'singleDevice',
    backed_up: false,
    created_at: '2026-01-04T12:00:00.000Z',
    last_used_at: null,
  },
]

const mfaStatus = { has_mfa: true, passkeys_count: passkeys.length, totp_count: 1 }

export const WithPasskeys: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PasskeyManager
        initialData={{ results: passkeys, page_info: pageInfo }}
        mfaStatus={mfaStatus}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PasskeyManager
        initialData={{ results: [], page_info: pageInfo }}
        mfaStatus={{ has_mfa: false, passkeys_count: 0, totp_count: 0 }}
      />
    </StoryFrame>
  ),
}
