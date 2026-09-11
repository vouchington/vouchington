import { type ReactNode, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { KeyboardShortcutsDialog } from '@/components/keyboard-shortcuts-dialog'
import { SidebarSiteFooter } from '@/components/sidebar-site-footer'
import { TopCommunities } from '@/components/home/top-communities'
import { TopReferralPrograms } from '@/components/home/top-referral-programs'
import { KEYBOARD_SHORTCUTS } from '@/lib/keyboard-shortcuts'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeCommunityMetrics,
  makeTopicsSearchResponse,
  makeTopic,
} from '@/test-helpers/api-responses'
import {
  projectTopCommunities,
  projectTopReferralPrograms,
} from '@/lib/view-models/homepage-view-models'

const meta = {
  title: 'Shared/HomeNavigation',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-6'>{children}</div>
  </main>
)

const topCommunitiesData = makeCommunitiesSearchResponse({
  communities: [
    makeCommunity({ id: 'community-1', name: 'Credit Card Fans', slug: 'credit-card-fans' }),
    makeCommunity({ id: 'community-2', name: 'Travel Points', slug: 'travel-points' }),
  ],
  communityMetrics: {
    'community-1': makeCommunityMetrics({ id: 'community-1', member_count: 2800 }),
    'community-2': makeCommunityMetrics({ id: 'community-2', member_count: 1825 }),
  },
})

const topReferralProgramsData = makeTopicsSearchResponse({
  topics: [
    makeTopic({
      id: 'topic-1',
      name: 'Chase Sapphire',
      slug: 'chase-sapphire',
      topic_type: 'referral_program',
    }),
    makeTopic({
      id: 'topic-2',
      name: 'American Express',
      slug: 'american-express',
      topic_type: 'referral_program',
    }),
  ],
})

export const Footer: Story = {
  render: () => (
    <Frame>
      <SidebarSiteFooter />
    </Frame>
  ),
}

export const KeyboardShortcuts: Story = {
  render: () => <KeyboardShortcutsStory />,
}

function KeyboardShortcutsStory() {
  const [open, setOpen] = useState(true)

  return (
    <Frame>
      <KeyboardShortcutsDialog
        open={open}
        onOpenChange={setOpen}
        shortcuts={KEYBOARD_SHORTCUTS}
      />
    </Frame>
  )
}

export const TopCommunitiesCard: Story = {
  render: () => (
    <Frame>
      <TopCommunities data={projectTopCommunities(topCommunitiesData)} />
    </Frame>
  ),
}

export const TopReferralProgramsCard: Story = {
  render: () => (
    <Frame>
      <TopReferralPrograms data={projectTopReferralPrograms(topReferralProgramsData)} />
    </Frame>
  ),
}
