import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator, loadMessages } from '@ts-shared/ui-messages'
import { PublicLandingPageView } from '@/components/landing-pages/public-landing-page'
import { LandingPagesManager } from '@/components/my/landing-pages-manager'
import { ProfileLinkForm } from '@/components/my/profile-link-form'
import { ReferralCtaAside } from '@/components/referral-cta-aside'
import { ReferralLinksAsideContent } from '@/components/referral-links/referral-links-aside-content'
import { ReferralLinkForm } from '@/components/referral-links/referral-link-form'
import { EntityStoryFrame, AsideStack, StoryCard } from './entity-story-frame'
import {
  landingPageCandidates,
  landingPageWithItems,
  publicLandingPage,
  storyCurrentUser,
} from './entity-fixtures'

const t = createTranslator('en', await loadMessages('en'))

const meta = {
  title: 'Entities/Landing Pages',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const NoUsername: Story = {
  parameters: { auth: { currentUser: { ...storyCurrentUser, username: null } } },
  render: () => (
    <EntityStoryFrame title='Landing pages manager — no username'>
      <LandingPagesManager
        username={null}
        initialPages={[]}
        initialSelectedPage={null}
        candidates={landingPageCandidates}
      />
    </EntityStoryFrame>
  ),
}

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Landing pages manager'
      aside={LandingPageAsides}
    >
      <LandingPagesManager
        username={storyCurrentUser.username ?? null}
        initialPages={[landingPageWithItems]}
        initialSelectedPage={landingPageWithItems}
        candidates={landingPageCandidates}
      />
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='Landing page forms'>
      <ProfileLinkForm
        loading={false}
        onCancel={() => undefined}
        onSubmit={async () => undefined}
      />
      <ReferralLinkForm referralProgramId='referral-program-1' />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame title='Public landing page'>
      <PublicLandingPageView
        data={publicLandingPage}
        canonicalPath='/@cardholder'
        t={t}
      />
    </EntityStoryFrame>
  ),
}

export const ItemVariations: Story = {
  render: () => (
    <EntityStoryFrame title='Landing page item variations'>
      <PublicLandingPageView
        data={publicLandingPage}
        canonicalPath='/@cardholder/rewards'
        t={t}
      />
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  parameters: {
    auth: { currentUser: null },
    nextjs: { navigation: { query: { referrer: 'alex' } } },
  },
  render: () => (
    <EntityStoryFrame title='Landing page asides'>
      <LandingPageAsides />
    </EntityStoryFrame>
  ),
}

function LandingPageAsides() {
  return (
    <AsideStack>
      <ReferralCtaAside />
      <ReferralLinksAsideContent
        topicId='referral-program-1'
        topicType='referral-program'
        response={{
          links: [
            {
              id: 'landing-referral-link',
              user_id: storyCurrentUser.id,
              is_official: false,
              referral_program_id: 'referral-program-1',
              url: 'https://bank.example/ref/alex',
              label: 'Landing page referral',
              priority_group: 1,
              contribution_rank: 1,
              tier_rank: 1,
              best_score: 5,
              review_post_id: null,
              review_post_slug: null,
              review_avg_rating: null,
            },
          ],
          users: {
            [storyCurrentUser.id]: {
              id: storyCurrentUser.id,
              username: storyCurrentUser.username!,
              display_name: 'Alex Morgan',
            },
          },
        }}
      />
      <StoryCard title='Public path'>/@cardholder/rewards</StoryCard>
    </AsideStack>
  )
}
