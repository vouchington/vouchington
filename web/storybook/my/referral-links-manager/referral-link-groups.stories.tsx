import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  ReferralLinkActions,
  ReferralLinkStatus,
} from '@/components/my/referral-links-manager/referral-link-actions'
import { ReferralLinkGroups } from '@/components/my/referral-links-manager/referral-link-groups'
import { StoryFrame } from '@/storybook/story-frame'
import { makeUserReferralLink } from '@/test-helpers/api-responses/referral-links'

const meta = {
  title: 'My/Referral Link Groups',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const link = makeUserReferralLink()
const groups = [
  { programId: link.referral_program_id, programName: 'Sapphire Reserve', links: [link] },
]

export const Groups: Story = {
  render: () => (
    <StoryFrame>
      <ReferralLinkGroups
        confirmingDeleteId={null}
        editLabel=''
        editingId={null}
        groups={groups}
        hasPlusTier
        loadingIds={new Set()}
        onDelete={() => {}}
        onSaveLabel={() => {}}
        onToggleActive={() => {}}
        onUnfurl={() => {}}
        setConfirmingDeleteId={() => {}}
        setEditLabel={() => {}}
        setEditingId={() => {}}
      />
    </StoryFrame>
  ),
}

export const Actions: Story = {
  render: () => (
    <StoryFrame>
      <ReferralLinkActions
        confirmingDeleteId={link.id}
        hasPlusTier
        link={link}
        loadingIds={new Set()}
        onDelete={() => {}}
        onToggleActive={() => {}}
        onUnfurl={() => {}}
        setConfirmingDeleteId={() => {}}
        setEditLabel={() => {}}
        setEditingId={() => {}}
      />
    </StoryFrame>
  ),
}

export const Status: Story = {
  render: () => (
    <StoryFrame>
      <ReferralLinkStatus link={link} />
    </StoryFrame>
  ),
}
