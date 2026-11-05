import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { CommunitySettingsPolicyFields } from '@/components/communities/community-settings-policy-fields'
import { CreateCommunityDetailsFields } from '@/components/communities/create-community-details-fields'
import type { CommunityListType, CommunityMemberRosterVisibility } from '@/types/api-responses'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Community Form Fields',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const idle = fn()

function PolicyFields() {
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [listType, setListType] = useState<'none' | CommunityListType>('follow')
  const [memberRosterVisibility, setMemberRosterVisibility] =
    useState<CommunityMemberRosterVisibility>('members')
  const [requiresPostApproval, setRequiresPostApproval] = useState(false)
  const [allowMemberInvites, setAllowMemberInvites] = useState(true)
  return (
    <CommunitySettingsPolicyFields
      allowMemberInvites={allowMemberInvites}
      listType={listType}
      memberRosterVisibility={memberRosterVisibility}
      requiresPostApproval={requiresPostApproval}
      setAllowMemberInvites={setAllowMemberInvites}
      setListType={setListType}
      setMemberRosterVisibility={setMemberRosterVisibility}
      setRequiresPostApproval={setRequiresPostApproval}
      setVisibility={setVisibility}
      visibility={visibility}
    />
  )
}

function DetailsFields() {
  const [name, setName] = useState('Credit Cards')
  const [slug, setSlug] = useState('credit-cards')
  const [markdown, setMarkdown] = useState('Card reviews and application data points.')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [allowMemberInvites, setAllowMemberInvites] = useState(true)
  return (
    <CreateCommunityDetailsFields
      allowMemberInvites={allowMemberInvites}
      markdown={markdown}
      name={name}
      nameTooShort={false}
      setAllowMemberInvites={setAllowMemberInvites}
      setMarkdown={setMarkdown}
      setName={setName}
      setSlug={setSlug}
      setVisibility={setVisibility}
      slug={slug}
      slugAvailability={{
        state: { status: 'idle', conflict: null },
        onBlur: idle,
        reset: idle,
      }}
      visibility={visibility}
    />
  )
}

export const SettingsPolicy: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <PolicyFields />
    </StoryFrame>
  ),
}

export const CreateDetails: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <DetailsFields />
    </StoryFrame>
  ),
}
