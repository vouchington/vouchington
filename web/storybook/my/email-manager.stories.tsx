import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EmailManager } from '@/components/my/email-manager'
import { AddEmailForm } from '@/components/my/email-manager/add-email-form'
import { EmailList } from '@/components/my/email-manager/email-list'
import { VerifyEmailForm } from '@/components/my/email-manager/verify-email-form'
import { clearMyAccountFixture, setMyAccountFixture } from '@/storybook/mocks/my-account-fixture'
import { StoryFrame } from '@/storybook/story-frame'
import type { EmailAddress } from '@/types/user'

const meta = {
  title: 'My/Email Manager',
  beforeEach() {
    setMyAccountFixture()
    return () => clearMyAccountFixture()
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const emails: EmailAddress[] = [
  { email_address: 'alex@voucha.ai', is_primary: true, created_at: '2026-01-04T12:00:00.000Z' },
  {
    email_address: 'alex+work@voucha.ai',
    is_primary: false,
    created_at: '2026-02-04T12:00:00.000Z',
  },
]

export const Manager: Story = {
  render: () => (
    <StoryFrame>
      <EmailManager initialEmailAddresses={emails} />
    </StoryFrame>
  ),
}

export const List: Story = {
  render: () => (
    <StoryFrame>
      <EmailList
        emails={emails}
        loading={false}
        onRemove={() => {}}
        onSetPrimary={() => {}}
      />
    </StoryFrame>
  ),
}

function AddDraft() {
  const [newEmail, setNewEmail] = useState('')
  return (
    <AddEmailForm
      loading={false}
      newEmail={newEmail}
      onCancel={() => {}}
      onRequestVerification={event => event.preventDefault()}
      setNewEmail={setNewEmail}
    />
  )
}

export const Add: Story = {
  render: () => (
    <StoryFrame>
      <AddDraft />
    </StoryFrame>
  ),
}

function VerifyDraft() {
  const [token, setToken] = useState('')
  const submitting = useRef(false)
  return (
    <VerifyEmailForm
      loading={false}
      pendingEmail='alex+new@voucha.ai'
      submitting={submitting}
      token={token}
      onCancel={() => {}}
      onSubmit={event => event.preventDefault()}
      setToken={setToken}
      submitVerify={() => {}}
    />
  )
}

export const Verify: Story = {
  render: () => (
    <StoryFrame>
      <VerifyDraft />
    </StoryFrame>
  ),
}
