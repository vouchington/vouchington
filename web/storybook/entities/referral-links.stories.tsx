import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { ReferralLinkForm } from '@/components/referral-links/referral-link-form'
import { ReferralLinkCard } from '@/components/referral-links/referral-link-card'
import { ReferralLinkFeedCard } from '@/components/feed/referral-link-feed-card'
import { ReferralLinkList } from '@/components/referral-links/referral-link-list'
import { EntityStoryFrame } from './entity-story-frame'
import { storyCurrentUser } from './entity-fixtures'
import { EmptyReferralLinksAside, ReferralLinksAside } from './referral-links-story-aside'
import {
  emptyResponse,
  feedItem,
  feedUser,
  sampleLink,
  sampleLinkWithReview,
  sampleResponse,
  sampleUser,
} from './referral-links-story-fixtures'

const meta = {
  title: 'Entities/Referral Links',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const t = createTranslator('en', await loadJsonMessages('en'))

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
      <ReferralLinkList
        t={t}
        response={sampleResponse}
      />
    </EntityStoryFrame>
  ),
}

export const EmptyList: Story = {
  render: () => (
    <EntityStoryFrame title='Referral link list — empty'>
      <ReferralLinkList
        t={t}
        response={emptyResponse}
      />
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

export const EmptyPersonalizedAside: Story = {
  render: () => (
    <EntityStoryFrame
      title='Referral links aside — empty personalized list'
      aside={EmptyReferralLinksAside}
    >
      <p className='text-sm text-muted-foreground'>Main content area</p>
    </EntityStoryFrame>
  ),
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
