import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  clearStoryMutationFixture,
  setStoryMutationFixture,
} from '@/storybook/mocks/story-mutation-fixture'
import { InviteManager } from '@/components/communities/invite-manager'
import type { CommunityInvite, CommunityInvitesResponseBody } from '@/types/api-responses'
import { communities } from '@/storybook/entities/fixtures/communities'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Invite Manager',
  component: InviteManager,
  beforeEach() {
    setStoryMutationFixture()
    return () => clearStoryMutationFixture()
  },
} satisfies Meta<typeof InviteManager>

export default meta
type Story = StoryObj<typeof meta>

const pendingInvite: CommunityInvite = {
  __entity_type: 'community_invite',
  id: 'invite-alex',
  code: 'CARD42',
  community_id: communities[0]!.id,
  invited_user_id: publicUsers[0]!.id,
  invited_email: 'alex@example.com',
  invited_by_id: storyCurrentUser.id,
  accepted_at: null,
  accepted_by_user_id: null,
  declined_at: null,
  revoked_at: null,
  created_at: '2026-05-24T00:00:00.000Z',
}

const withInvite: CommunityInvitesResponseBody = {
  results: [{ __entity_type: 'community_invite', id: pendingInvite.id }],
  page_info,
  community_invites: { [pendingInvite.id]: pendingInvite },
}

const emptyInvites: CommunityInvitesResponseBody = {
  results: [],
  page_info,
  community_invites: {},
}

function InvitePreview({
  communitySlug,
  data: initialData,
}: {
  communitySlug: string
  data: CommunityInvitesResponseBody
}) {
  const [data, setData] = useState(initialData)
  return (
    <StoryFrame>
      <InviteManager
        communitySlug={communitySlug}
        data={data}
        onInviteCreated={invite => {
          setData(current => ({
            ...current,
            results: [...current.results, { __entity_type: 'community_invite', id: invite.id }],
            community_invites: { ...current.community_invites, [invite.id]: invite },
          }))
        }}
      />
    </StoryFrame>
  )
}

export const PendingInvite: Story = {
  args: { communitySlug: communities[0]!.slug, data: withInvite },
  render: args => <InvitePreview {...args} />,
}

export const Empty: Story = {
  args: { communitySlug: communities[0]!.slug, data: emptyInvites },
  render: args => <InvitePreview {...args} />,
}
