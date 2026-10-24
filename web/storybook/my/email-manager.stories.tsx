import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EmailManager } from '@/components/my/email-manager'
import { EmailList } from '@/components/my/email-manager/email-list'
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

const pageInfo = { has_next_page: false, end_cursor: null, start_cursor: null }

const emails: EmailAddress[] = [
  { email_address: 'alex@example.com', is_primary: true, created_at: '2026-03-01T12:00:00.000Z' },
  { email_address: 'alex@work.example', is_primary: false, created_at: '2026-05-12T09:30:00.000Z' },
]

export const WithAddresses: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <EmailManager initialData={{ results: emails, page_info: pageInfo }} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <EmailManager initialData={{ results: [], page_info: pageInfo }} />
    </StoryFrame>
  ),
}

export const ListIdle: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <EmailList
        emails={emails}
        loading={false}
        onRemove={() => undefined}
        onSetPrimary={() => undefined}
      />
    </StoryFrame>
  ),
}

export const ListSaving: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <EmailList
        emails={emails}
        loading
        onRemove={() => undefined}
        onSetPrimary={() => undefined}
      />
    </StoryFrame>
  ),
}
