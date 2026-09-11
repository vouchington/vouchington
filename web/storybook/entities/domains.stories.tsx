import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import DomainModerationPanel from '@/components/domains/domain-moderation-panel'
import DomainCrawlersPanel from '@/components/domains/domain-crawlers-panel'
import { DomainActionsAside } from '@/components/domains/domain-actions-aside'
import { DomainDetailTabs } from '@/components/domains/domain-detail-tabs'
import { DomainsSearchForm } from '@/components/domains/domains-search-form'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import { HostnameListItem } from '@/components/domains/hostname-list-item'
import { HostnameVouchDisavowVote } from '@/components/hostnames/hostname-vouch-disavow-vote'
import { EntityStoryFrame, AsideStack, StoryCard, StoryGrid } from './entity-story-frame'
import { hostnames, hostnamesResponse } from './entity-fixtures'

const meta = {
  title: 'Entities/Domains',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Domains'
      aside={DomainAsides}
    >
      <div className='space-y-4'>
        {hostnamesResponse.results.map(result => {
          const hostname = hostnamesResponse.hostnames[result.id]!
          const election = hostnamesResponse.hostname_elections?.[result.id]
          const topic = hostname.topic_id
            ? hostnamesResponse.topics?.[hostname.topic_id]
            : undefined
          return (
            <HostnameListItem
              key={result.id}
              hostname={hostname}
              election={election}
              topic={topic}
              isAdmin
              showVoteWidget={false}
            />
          )
        })}
      </div>
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='Domain search'>
      <DomainsSearchForm
        defaultQuery='example'
        isAdmin
        defaultBlocked='all'
        defaultCrawlable='true'
      />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame
      title='Domain detail'
      aside={DomainAsides}
    >
      <DomainDetailTabs>
        <StoryCard title='Overview'>
          <DomainTrustBadge
            scoreNet={32}
            countUp={40}
            countDown={8}
            hostname={hostnames[0]!.hostname}
          />
        </StoryCard>
        <DomainModerationPanel hostname={hostnames[0]!} />
        <DomainCrawlersPanel
          crawlers={[
            {
              id: 'crawler-1',
              description: 'Default HTML crawler',
              crawler_type: 'html',
              priority: 10,
            },
          ]}
        />
      </DomainDetailTabs>
    </EntityStoryFrame>
  ),
}

export const TrustVariations: Story = {
  render: () => (
    <EntityStoryFrame title='Trust variations'>
      <StoryGrid>
        {[
          ['trusted', 24, 32, 8],
          ['neutral', 1, 5, 4],
          ['distrusted', -8, 2, 10],
          ['unrated', 0, 0, 0],
        ].map(([label, scoreNet, countUp, countDown]) => (
          <StoryCard
            key={label}
            title={String(label)}
          >
            <DomainTrustBadge
              scoreNet={Number(scoreNet)}
              countUp={Number(countUp)}
              countDown={Number(countDown)}
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const VoteControls: Story = {
  render: () => {
    const electionId =
      hostnamesResponse.hostname_elections?.[hostnames[0]!.id]?.id ?? hostnames[0]!.id
    return (
      <EntityStoryFrame title='Domain vote controls'>
        <StoryCard title='Vouch / Disavow'>
          <HostnameVouchDisavowVote
            electionId={electionId}
            countUp={24}
            countDown={3}
            signedOut={false}
          />
        </StoryCard>
        <StoryCard title='Signed out'>
          <HostnameVouchDisavowVote
            electionId={electionId}
            countUp={24}
            countDown={3}
            signedOut
          />
        </StoryCard>
      </EntityStoryFrame>
    )
  },
}

export const ActionsAside: Story = {
  render: () => (
    <EntityStoryFrame title='Domain actions aside'>
      <AsideStack>
        <DomainActionsAside hostnameId={hostnames[0]!.id} />
      </AsideStack>
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='Domain asides'>
      <DomainAsides />
    </EntityStoryFrame>
  ),
}

function DomainAsides() {
  return (
    <AsideStack>
      <DomainModerationPanel hostname={hostnames[1]!} />
      <DomainCrawlersPanel
        crawlers={[
          {
            id: 'crawler-2',
            description: 'RSS discovery crawler',
            crawler_type: 'rss',
            priority: 5,
          },
        ]}
      />
    </AsideStack>
  )
}
