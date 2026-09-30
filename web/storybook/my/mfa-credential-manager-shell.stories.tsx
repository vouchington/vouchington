import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MfaCredentialManagerShell } from '@/components/my/mfa-credential-manager-shell'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Mfa Credential Manager Shell',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const pagination = {
  clearError: () => undefined,
  endCursor: null,
  fetchError: null,
  hasNextPage: false,
  loadMore: () => Promise.resolve(),
  loadingMore: false,
  resetKey: Symbol('mfa-credential-manager-shell'),
}

const mfaStatus = { has_mfa: true, passkeys_count: 1, totp_count: 1 }

export const Passkeys: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <MfaCredentialManagerShell
        action={{ handleAdd: () => undefined, kind: 'list' }}
        credential='passkey'
        list={<p>MacBook Pro</p>}
        mfaStatus={mfaStatus}
        onReauthClose={() => undefined}
        onReauthVerified={() => undefined}
        pagination={pagination}
        reauthOpen={false}
      />
    </StoryFrame>
  ),
}

export const Authenticators: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <MfaCredentialManagerShell
        action={{ handleAdd: () => undefined, kind: 'list' }}
        credential='totp'
        list={<p>1Password</p>}
        mfaStatus={mfaStatus}
        onReauthClose={() => undefined}
        onReauthVerified={() => undefined}
        pagination={pagination}
        reauthOpen={false}
      />
    </StoryFrame>
  ),
}

export const AuthenticatorSetup: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <MfaCredentialManagerShell
        action={{ kind: 'setup', panel: <p>Scan the setup QR code.</p> }}
        credential='totp'
        list={<p>1Password</p>}
        mfaStatus={mfaStatus}
        onReauthClose={() => undefined}
        onReauthVerified={() => undefined}
        pagination={pagination}
        reauthOpen={false}
      />
    </StoryFrame>
  ),
}
