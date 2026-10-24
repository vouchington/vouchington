import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  ReferralLinkActions,
  ReferralLinkStatus,
} from '@/components/my/referral-links-manager/referral-link-actions'
import { StoryFrame } from '@/storybook/story-frame'
import type { UserReferralLinkWithDetails } from '@/types/api-responses'

const meta = {
  title: 'My/Referral Link Actions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const noop = () => undefined

const link: UserReferralLinkWithDetails = {
  id: 'referral-link-1',
  user_id: 'user-1',
  referral_program_id: 'referral-program-1',
  url_id: 'url-1',
  url: 'https://example.com/refer/alex',
  label: 'Use my card referral',
  activated_at: '2026-08-01T12:00:00.000Z',
  deactivated_at: null,
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
  referral_program_name: 'Sapphire Reserve',
  referral_program_slug: 'sapphire-reserve',
  parent_link_id: null,
  unfurl_requested_at: null,
  unfurl_completed_at: null,
  unfurl_failed_at: null,
  unfurl_last_error: null,
}

const amexLink: UserReferralLinkWithDetails = {
  ...link,
  id: 'referral-link-amex',
  referral_program_name: 'American Express',
  referral_program_slug: 'amex-referral-program',
}

function Actions({
  value,
  hasPlusTier = true,
  confirmingDeleteId = null,
}: {
  value: UserReferralLinkWithDetails
  hasPlusTier?: boolean
  confirmingDeleteId?: string | null
}) {
  return (
    <StoryFrame width='max-w-3xl'>
      <div className='space-y-3'>
        <ReferralLinkStatus link={value} />
        <ReferralLinkActions
          confirmingDeleteId={confirmingDeleteId}
          hasPlusTier={hasPlusTier}
          link={value}
          loadingIds={new Set()}
          onDelete={noop}
          onToggleActive={noop}
          onUnfurl={noop}
          setConfirmingDeleteId={noop}
          setEditLabel={noop}
          setEditingId={noop}
        />
      </div>
    </StoryFrame>
  )
}

export const Active: Story = { render: () => <Actions value={link} /> }

export const Inactive: Story = {
  render: () => (
    <Actions value={{ ...link, activated_at: null, deactivated_at: '2026-09-01T12:00:00.000Z' }} />
  ),
}

export const AmexNeverUnfurled: Story = { render: () => <Actions value={amexLink} /> }

export const AmexRequiresPlus: Story = {
  render: () => (
    <Actions
      value={amexLink}
      hasPlusTier={false}
    />
  ),
}

export const AmexUnfurlFailed: Story = {
  render: () => (
    <Actions
      value={{
        ...amexLink,
        unfurl_requested_at: '2026-10-01T12:00:00.000Z',
        unfurl_failed_at: '2026-10-01T12:05:00.000Z',
        unfurl_last_error: 'The referral page did not list any cards.',
      }}
    />
  ),
}

export const ConfirmingDelete: Story = {
  render: () => (
    <Actions
      value={link}
      confirmingDeleteId={link.id}
    />
  ),
}
