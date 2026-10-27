import { PasskeyReAuthPane } from '@/components/my/mfa-reauth-dialog/passkey-pane'
import { ProviderReAuthPane } from '@/components/my/mfa-reauth-dialog/provider-pane'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MfaReauthDialog } from '@/components/my/mfa-reauth-dialog'
import { MethodSelector } from '@/components/my/mfa-reauth-dialog/method-selector'
import {
  EmailVerificationPane,
  TotpVerificationPane,
} from '@/components/my/mfa-reauth-dialog/verification-panes'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Mfa Reauth Dialog',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AuthenticatorCode: Story = {
  render: () => (
    <StoryFrame>
      <MfaReauthDialog
        open
        mfaStatus={{ has_mfa: true, passkeys_count: 1, totp_count: 1 }}
        onVerified={() => {}}
        onClose={() => {}}
      />
    </StoryFrame>
  ),
}

export const EmailCode: Story = {
  render: () => (
    <StoryFrame>
      <MfaReauthDialog
        open
        mfaStatus={{ has_mfa: false, passkeys_count: 0, totp_count: 0 }}
        onVerified={() => {}}
        onClose={() => {}}
      />
    </StoryFrame>
  ),
}

function SentEmailCode() {
  const [emailCode, setEmailCode] = useState('')
  return (
    <StoryFrame width='max-w-md'>
      <EmailVerificationPane
        emailCode={emailCode}
        emailSent
        handleEmailVerify={() => {}}
        handleResendEmail={() => {}}
        handleSendEmail={() => {}}
        loading={false}
        sentToEmail='cardholder@example.com'
        setEmailCode={setEmailCode}
      />
    </StoryFrame>
  )
}

export const EmailCodeSent: Story = {
  render: () => <SentEmailCode />,
}

export const MethodChoice: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <MethodSelector
        loading={false}
        method='totp'
        methods={['totp', 'email']}
        setEmailCode={() => {}}
        setEmailSent={() => {}}
        setMethod={() => {}}
        setSentToEmail={() => {}}
      />
    </StoryFrame>
  ),
}

export const ProviderOnly: Story = {
  beforeEach() {
    setMyAccountFixture({
      has_email: false,
      has_totp: false,
      has_passkey: false,
      providers: ['github'],
    })
  },
  render: () => (
    <StoryFrame>
      <MfaReauthDialog
        open
        mfaStatus={{ has_mfa: false, passkeys_count: 0, totp_count: 0 }}
        onVerified={() => {}}
        onClose={() => {}}
      />
    </StoryFrame>
  ),
}

function TotpCode() {
  const [totpCode, setTotpCode] = useState('')
  return (
    <StoryFrame width='max-w-md'>
      <TotpVerificationPane
        handleTotpVerify={() => {}}
        loading={false}
        setTotpCode={setTotpCode}
        totpCode={totpCode}
      />
    </StoryFrame>
  )
}

export const AuthenticatorPane: Story = {
  render: () => <TotpCode />,
}

export const NamedPasskeyChoices: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <PasskeyReAuthPane
        loading={false}
        setLoading={() => {}}
        onVerified={() => {}}
      />
    </StoryFrame>
  ),
}

export const LinkedProviderProof: Story = {
  render: () => (
    <StoryFrame width='max-w-md'>
      <ProviderReAuthPane
        provider='github'
        loading={false}
        setLoading={() => {}}
        onVerified={() => {}}
      />
    </StoryFrame>
  ),
}
