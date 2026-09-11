import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator, loadMessages } from '@ts-shared/ui-messages'
import { AgentBadge } from '@/components/shared/agent-badge'
import { RssFeedLink } from '@/components/shared/rss-feed-link'
import { SearchInput, SearchInputShell } from '@/components/shared/search-input'
import { HashtagSearchInput } from '@/components/shared/hashtag-search-input'
import { LinkSelectDropdown } from '@/components/shared/link-select-dropdown'
import { ListSearchError } from '@/components/shared/list-search-error'
import { TitleRouteDropdown } from '@/components/shared/title-route-dropdown'
import { ViewModeDropdown } from '@/components/shared/view-mode-dropdown'
import { DataPointResultBadge, DataPointRow } from '@/components/posts/data-point-detail-fields'
import { ReviewContentCounter } from '@/components/posts/review-content-counter'
import { TopicVouchDisavowVote } from '@/components/topics/topic-vouch-disavow-vote'
import { HostnameVouchDisavowVote } from '@/components/hostnames/hostname-vouch-disavow-vote'
import { EntityVouchDisavowVote } from '@/components/votes/entity-vouch-disavow-vote'
import { PlanFeatureLabel } from '@/components/memberships/plan-feature-label'
import { ReportReasonFieldset } from '@/components/shared/report-reason-fieldset'
import { FollowContextCard } from '@/components/social/follow-context-card'
import { IdentityVerifiedBadge } from '@/components/users/identity-verified-badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { publicUsers } from '../entities/entity-fixtures'

const meta = {
  title: 'Design System/Pure Components',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const t = createTranslator('en', await loadMessages('en'))

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-5 rounded-md border p-4'>{children}</div>
  </main>
)

const noopSubmitVote = async () => undefined

export const SharedBadgesAndLinks: Story = {
  render: () => (
    <Frame>
      <div className='flex items-center gap-3'>
        <AgentBadge />
        <RssFeedLink href='https://example.com/feed.xml' />
      </div>
      <RssFeedLink
        href='https://example.com/feed.xml'
        label='RSS Feed'
        withLabel
      />
      <Separator />
      <SearchInput
        aria-label='Search examples'
        placeholder='Search'
      />
      <SearchInputShell>
        <Input
          aria-label='Custom search'
          placeholder='Custom shell'
          className='border-0 shadow-none focus-visible:ring-0'
        />
      </SearchInputShell>
    </Frame>
  ),
}

export const SharedDropdownControls: Story = {
  render: () => (
    <Frame>
      <TitleRouteDropdown
        label='All'
        items={[
          { label: 'All', href: '/posts', active: true },
          { label: 'Reviews', href: '/reviews' },
        ]}
      />
      <div className='flex flex-wrap gap-2'>
        <LinkSelectDropdown
          label='Topics'
          ariaLabel='Select feed filter'
          dataPw='storybook-feed-filter'
          items={[
            { label: 'All', href: '/feed/posts' },
            { label: 'Topics', href: '/feed/posts/topics', active: true },
          ]}
        />
        <ViewModeDropdown
          value='list'
          onValueChange={() => undefined}
          options={[
            { label: 'List', value: 'list', icon: 'compact', dataPw: 'storybook-view-mode-list' },
            { label: 'Card', value: 'card', icon: 'card', dataPw: 'storybook-view-mode-card' },
          ]}
        />
      </div>
      <HashtagSearchInput
        aria-label='Search examples'
        value='credit cards'
        onValueChange={() => undefined}
      />
      <ListSearchError
        t={t}
        message='Topic not found: #cards'
      />
    </Frame>
  ),
}

export const DataPointDetails: Story = {
  render: () => (
    <Frame>
      <DataPointRow
        label='Annual fee'
        value='$95'
      />
      <DataPointRow label='Result'>
        <DataPointResultBadge
          result='approved'
          label='Approved'
        />
      </DataPointRow>
      <ReviewContentCounter
        charCount={280}
        wordCount={55}
        sentenceCount={4}
      />
    </Frame>
  ),
}

export const PlanFeatureLabels: Story = {
  render: () => (
    <Frame>
      <PlanFeatureLabel label='Browse all content' />
      <PlanFeatureLabel
        label='Immediate access'
        tooltip='Start posting and rating right away, no waiting period'
        className='h-auto justify-start p-0 text-left text-sm font-normal underline decoration-dotted underline-offset-2 hover:bg-transparent hover:text-foreground'
      />
    </Frame>
  ),
}

export const EntityVouchDisavowVotes: Story = {
  render: () => (
    <Frame>
      <TopicVouchDisavowVote
        electionId='storybook-topic-election'
        countUp={128}
        countDown={7}
        signedOut
      />
      <HostnameVouchDisavowVote
        electionId='storybook-hostname-election'
        countUp={44}
        countDown={3}
        signedOut
      />
      <EntityVouchDisavowVote
        entityType='topic'
        electionId='storybook-entity-election'
        countUp={12}
        countDown={1}
        submitVote={noopSubmitVote}
        noun='topic'
        signedOut
      />
    </Frame>
  ),
}

export const SharedStateSurfaces: Story = {
  render: () => (
    <Frame>
      <ReportReasonFieldset
        entityType='post'
        reason='spam'
        onSelect={() => undefined}
      />
      <FollowContextCard
        title='Follow context'
        sections={[
          {
            title: 'People you follow',
            data: {
              total: 4,
              users: publicUsers.slice(0, 2),
            },
            emptyLabel: 'No followed users yet',
          },
        ]}
      />
      <IdentityVerifiedBadge />
    </Frame>
  ),
}
