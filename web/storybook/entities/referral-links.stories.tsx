import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReferralLinkForm } from '@/components/referral-links/referral-link-form'
import { ReferralLinkCard } from '@/components/referral-links/referral-link-card'
import { ReferralLinkFeedCard } from '@/components/feed/referral-link-feed-card'
import { ReferralLinkList } from '@/components/referral-links/referral-link-list'
import { ReferralLinksAsideContent } from '@/components/referral-links/referral-links-aside-content'
import { EntityStoryFrame, AsideStack } from './entity-story-frame'
import { storyCurrentUser } from './entity-fixtures'
import type {
  PrioritizedReferralLinksResponse,
  ReferralLinkFeedItem,
  ReferralLinkFeedUser,
} from '@/types/api-responses'

const meta = {
  title: 'Entities/Referral Links',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sampleUser = {
  id: storyCurrentUser.id,
  username: storyCurrentUser.username!,
  display_name: 'Alex Morgan',
}

const sampleLink = {
  id: 'link-sample',
  user_id: storyCurrentUser.id,
  is_official: false,
  referral_program_id: 'rp-chase',
  url: 'https://www.referyourchasecard.com/m/21a/abc123',
  label: 'My Chase Sapphire link',
  priority_group: 1,
  contribution_rank: 1,
  tier_rank: 1,
  best_score: 10,
  review_post_id: null,
  review_post_slug: null,
  review_avg_rating: null,
}

const sampleLinkWithReview = {
  ...sampleLink,
  id: 'link-with-review',
  review_post_id: 'post-chase-review',
  review_post_slug: 'chase-sapphire-preferred-review',
  review_avg_rating: 4.5,
}

const sampleResponse: PrioritizedReferralLinksResponse = {
  links: [
    sampleLink,
    {
      ...sampleLink,
      id: 'link-2',
      user_id: 'user-bob',
      label: "Bob's Chase link",
      priority_group: 2,
    },
  ],
  users: {
    [storyCurrentUser.id]: sampleUser,
    'user-bob': { id: 'user-bob', username: 'bob', display_name: 'Bob Chen' },
  },
}

const emptyResponse: PrioritizedReferralLinksResponse = {
  links: [],
  users: {},
}

export const AddForm: Story = {
  render: () => (
    <EntityStoryFrame title='Add referral link form'>
      <ReferralLinkForm referralProgramId='rp-chase' />
    </EntityStoryFrame>
  ),
}

export const AddFormWithHelpText: Story = {
  render: () => (
    <EntityStoryFrame title='Add referral link form — with help text'>
      <ReferralLinkForm
        referralProgramId='rp-chase'
        validationInfo={{
          user_help_text: 'Find your link in Chase Online > Refer a Friend',
          example_urls: ['https://www.referyourchasecard.com/m/21a/xxxx'],
        }}
      />
    </EntityStoryFrame>
  ),
}

export const EditForm: Story = {
  render: () => (
    <EntityStoryFrame title='Edit referral link form'>
      <ReferralLinkForm
        referralProgramId='rp-chase'
        existingLink={{
          id: 'link-1',
          url: 'https://www.referyourchasecard.com/m/21a/abc123',
          label: 'My Chase link',
        }}
      />
    </EntityStoryFrame>
  ),
}

export const Card: Story = {
  render: () => (
    <EntityStoryFrame title='Referral link card'>
      <ReferralLinkCard
        link={sampleLink}
        user={sampleUser}
      />
    </EntityStoryFrame>
  ),
}

export const CardWithReview: Story = {
  render: () => (
    <EntityStoryFrame title='Referral link card — with review'>
      <ReferralLinkCard
        link={sampleLinkWithReview}
        user={sampleUser}
      />
    </EntityStoryFrame>
  ),
}

export const LinkList: Story = {
  render: () => (
    <EntityStoryFrame title='Referral link list'>
      <ReferralLinkList response={sampleResponse} />
    </EntityStoryFrame>
  ),
}

export const EmptyList: Story = {
  render: () => (
    <EntityStoryFrame title='Referral link list — empty'>
      <ReferralLinkList response={emptyResponse} />
    </EntityStoryFrame>
  ),
}

export const Aside: Story = {
  render: () => (
    <EntityStoryFrame
      title='Referral links aside'
      aside={ReferralLinksAside}
    >
      <p className='text-sm text-muted-foreground'>Main content area</p>
    </EntityStoryFrame>
  ),
}

const feedUser: ReferralLinkFeedUser = {
  id: storyCurrentUser.id,
  username: storyCurrentUser.username!,
  display_name: 'Alex Morgan',
  profile_image_id: null,
}

const feedItem: ReferralLinkFeedItem = {
  id: 'feed-link-1',
  user_id: storyCurrentUser.id,
  referral_program_id: 'rp-chase',
  referral_program_name: 'Chase Sapphire Preferred',
  referral_program_slug: 'chase-sapphire-preferred',
  url: 'https://www.referyourchasecard.com/m/21a/abc123',
  label: 'My Chase Sapphire link',
}

export const FeedCard: Story = {
  render: () => (
    <EntityStoryFrame title='Referral link feed card'>
      <ReferralLinkFeedCard
        item={feedItem}
        user={feedUser}
      />
    </EntityStoryFrame>
  ),
}

function ReferralLinksAside() {
  return (
    <AsideStack>
      <ReferralLinksAsideContent
        topicId='rp-chase'
        topicType='referral-program'
        response={sampleResponse}
      />
    </AsideStack>
  )
}
