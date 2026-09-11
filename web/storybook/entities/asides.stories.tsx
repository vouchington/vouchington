import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { AsideAccordion } from '@/components/asides/aside-accordion'
import { PopularCommunitiesAsideContent } from '@/components/asides/popular-communities-aside-content'
import { AsideSkeleton } from '@/components/asides/aside-skeleton'
import { ConnectSocialAsideContent } from '@/components/asides/connect-social-aside-content'
import { CreateFirstPostAsideContent } from '@/components/asides/create-first-post-aside-content'
import { DismissibleCtaAside } from '@/components/asides/dismissible-cta-aside'
import { CreateLandingPageAsideContent } from '@/components/asides/create-landing-page-aside-content'
import { FindPeopleAsideContent } from '@/components/asides/find-people-aside-content'
import { FollowTopicsAsideContent } from '@/components/asides/follow-topics-aside-content'
import { RecommendedTopicsAsideContent } from '@/components/asides/recommended-topics-aside-content'
import { UpgradeMembershipAsideContent } from '@/components/asides/upgrade-membership-aside-content'
import { EntityStoryFrame, AsideStack, StoryCard } from './entity-story-frame'

const meta = {
  title: 'Entities/Asides',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllAsides: Story = {
  render: () => (
    <EntityStoryFrame title='Reusable asides'>
      <AsideStack>
        <AboutVouchaAside />
        <CreateFirstPostAsideContent dismissKey='storybook-aside-create-first-post' />
        <CreateLandingPageAsideContent dismissKey='storybook-aside-create-landing-page' />
        <FollowTopicsAsideContent dismissKey='storybook-aside-follow-topics' />
        <RecommendedTopicsAsideContent
          topics={
            [
              { id: '1', name: 'Chase Sapphire', slug: 'chase-sapphire', topic_type: 'card' },
              { id: '2', name: 'Visa Platinum', slug: 'visa-platinum', topic_type: 'card' },
            ] as never
          }
          initialBookmarks={{}}
        />
        <FindPeopleAsideContent dismissKey='storybook-aside-find-people' />
        <ConnectSocialAsideContent dismissKey='storybook-aside-connect-social' />
        <UpgradeMembershipAsideContent dismissKey='storybook-aside-upgrade-membership' />
        <DismissibleCtaAside
          dismissKey='storybook-configurable-cta'
          title='Configurable CTA'
          description='Shared aside shell for short dismissible calls to action.'
          href='/posts/new'
          actionLabel='Start'
          variant='outline'
          data-pw='storybook-configurable-cta'
        />
        <PopularCommunitiesAsideContent
          communities={[
            { id: '1', slug: 'voucha-platform', name: 'Voucha Platform' },
            { id: '2', slug: 'voucha-quality-filters', name: 'Voucha Quality Filters' },
          ]}
        />
        <AsideAccordion title='Accordion aside'>
          <p className='text-sm text-muted-foreground'>Reusable collapsible aside content.</p>
        </AsideAccordion>
        <StoryCard title='Loading state'>
          <AsideSkeleton />
        </StoryCard>
      </AsideStack>
    </EntityStoryFrame>
  ),
}
