import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModmailInbox } from '../../components/communities/modmail-inbox'
import type { ModmailInboxResponseBody, ModmailThread } from '@/lib/api/client/modmail'
import { communities } from '@/storybook/entities/fixtures/communities'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { publicUsers, storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Communities/Modmail Inbox',
  component: ModmailInbox,
} satisfies Meta<typeof ModmailInbox>

export default meta
type Story = StoryObj<typeof meta>

const openThread: ModmailThread = {
  id: 'modmail-sapphire-referral',
  channel_type: 'modmail',
  title: 'Question about a removed Sapphire Reserve referral',
  community_id: communities[0]!.id,
  subject_user_id: publicUsers[0]!.id,
  assigned_mod_id: storyCurrentUser.id,
  assigned_at: '2026-05-21T15:00:00.000Z',
  resolved_at: null,
  resolved_by_id: null,
  created_by_id: publicUsers[0]!.id,
  created_at: '2026-05-21T14:30:00.000Z',
  updated_at: '2026-05-21T15:00:00.000Z',
}

const withThread: ModmailInboxResponseBody = {
  results: [openThread],
  page_info,
}

const emptyInbox: ModmailInboxResponseBody = {
  results: [],
  page_info,
}

export const OpenThread: Story = {
  args: { communitySlug: communities[0]!.slug, initialData: withThread },
  render: args => (
    <StoryFrame>
      <ModmailInbox {...args} />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  args: { communitySlug: communities[0]!.slug, initialData: emptyInbox },
  render: args => (
    <StoryFrame>
      <ModmailInbox {...args} />
    </StoryFrame>
  ),
}
