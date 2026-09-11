import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { VoteStoreProvider } from '@/lib/votes/vote-store-provider'
import { AgentBadge } from '@/components/shared/agent-badge'
import { RssFeedLink } from '@/components/shared/rss-feed-link'
import { SearchInput, SearchInputShell } from '@/components/shared/search-input'
import { DataPointResultBadge, DataPointRow } from '@/components/posts/data-point-detail-fields'
import { ReviewContentCounter } from '@/components/posts/review-content-counter'
import { TopicVouchDisavowVote } from '@/components/topics/topic-vouch-disavow-vote'
import { HostnameVouchDisavowVote } from '@/components/hostnames/hostname-vouch-disavow-vote'
import { EntityVouchDisavowVote } from '@/components/votes/entity-vouch-disavow-vote'
import { ConnectSocialAsideContent } from '@/components/asides/connect-social-aside-content'
import { CreateFirstPostAsideContent } from '@/components/asides/create-first-post-aside-content'
import { FollowTopicsAsideContent } from '@/components/asides/follow-topics-aside-content'
import { UpgradeMembershipAsideContent } from '@/components/asides/upgrade-membership-aside-content'

describe('pure leaf component contracts', () => {
  it('renders AgentBadge and RssFeedLink data-pw hooks', () => {
    render(
      <>
        <AgentBadge />
        <RssFeedLink
          href='https://example.com/feed.xml'
          label='RSS'
        />
      </>,
    )

    expect(screen.getByText('agent')).toHaveAttribute('data-pw', 'agent-badge')
    expect(screen.getByLabelText('RSS')).toHaveAttribute('data-pw', 'rss-feed-link')
  })

  it('renders SearchInputShell and SearchInput data-pw hooks', () => {
    const { container } = render(
      <>
        <SearchInputShell>
          <input aria-label='Custom' />
        </SearchInputShell>
        <SearchInput
          aria-label='Search'
          data-pw='custom-search'
        />
      </>,
    )

    expect(container.querySelector('[data-pw="search-input-shell"]')).not.toBeNull()
    expect(screen.getByLabelText('Search')).toHaveAttribute('data-pw', 'custom-search')
  })

  it('renders DataPointRow, DataPointResultBadge, and ReviewContentCounter data-pw hooks', () => {
    const { container } = render(
      <>
        <DataPointRow
          label='Result'
          value='Approved'
        />
        <DataPointResultBadge
          result='approved'
          label='Approved'
        />
        <ReviewContentCounter
          charCount={12}
          wordCount={2}
          sentenceCount={1}
        />
      </>,
    )

    expect(container.querySelector('[data-pw="data-point-row"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="data-point-result-badge"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="review-content-counter"]')).not.toBeNull()
  })

  it('renders TopicVouchDisavowVote and HostnameVouchDisavowVote through the shared vote wrapper', () => {
    const { container } = render(
      <TooltipProvider>
        <VoteStoreProvider>
          <TopicVouchDisavowVote
            electionId='topic-election'
            countUp={3}
            countDown={1}
            signedOut
          />
          <HostnameVouchDisavowVote
            electionId='hostname-election'
            countUp={5}
            countDown={2}
            signedOut
          />
          <EntityVouchDisavowVote
            entityType='topic'
            electionId='shared-election'
            countUp={7}
            countDown={0}
            submitVote={async () => undefined}
            noun='topic'
            signedOut
          />
        </VoteStoreProvider>
      </TooltipProvider>,
    )

    expect(container.querySelector('[data-pw="topic-vouch-disavow-vote"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="hostname-vouch-disavow-vote"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="entity-vouch-disavow-vote"]')).not.toBeNull()
  })

  it('renders memoized aside CTA content data-pw hooks', async () => {
    const { container } = render(
      <>
        <ConnectSocialAsideContent dismissKey='pure-test-connect-social' />
        <CreateFirstPostAsideContent dismissKey='pure-test-create-first-post' />
        <FollowTopicsAsideContent dismissKey='pure-test-follow-topics' />
        <UpgradeMembershipAsideContent dismissKey='pure-test-upgrade-membership' />
      </>,
    )

    await waitFor(() => {
      for (const id of [
        'connect-social-aside-content',
        'create-first-post-aside-content',
        'follow-topics-aside-content',
        'upgrade-membership-aside-content',
      ]) {
        expect(container.querySelector(`[data-pw="${id}"]`)).not.toBeNull()
      }
    })
  })
})
