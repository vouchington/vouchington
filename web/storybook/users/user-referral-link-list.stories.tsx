import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { PaginatedUserReferralLinkList } from '@/components/users/paginated-user-referral-link-list'
import { page_info } from '@/storybook/entities/fixtures/shared'
import { storyCurrentUser } from '@/storybook/entities/fixtures/users'
import { StoryFrame } from '@/storybook/story-frame'
import type { UserReferralLinkSummary } from '@/types/api-responses'

const meta = {
  title: 'Users/Referral Link List',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const link: UserReferralLinkSummary = {
  id: 'link-chase',
  user_id: 'user-alex',
  referral_program_id: 'rp-chase',
  referral_program_name: 'Chase Sapphire',
  referral_program_slug: 'chase-sapphire',
  url: 'https://example.com/ref/chase',
  label: 'My Chase link',
}

export const WithLinks: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PaginatedUserReferralLinkList
        initialData={{ results: [link], page_info }}
        userId={link.user_id}
        emptyTitle='No referral links found.'
        emptyDescription='No referral links have been added yet.'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame width='max-w-2xl'>
      <PaginatedUserReferralLinkList
        initialData={{ results: [], page_info }}
        userId='user-alex'
        emptyTitle='No referral links found.'
        emptyDescription='No referral links have been added yet.'
      />
    </StoryFrame>
  ),
}
