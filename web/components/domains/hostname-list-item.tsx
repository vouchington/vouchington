'use client'

import Link from 'next/link'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import { HostnameVouchDisavowVote } from '@/components/hostnames/hostname-vouch-disavow-vote'
import { TopicLabel } from '@/components/topics/topic-label'
import { domainHref } from '@/lib/links/entity-href'
import type { Hostname, HostnameElection } from '@/types/hostnames'
import type { Topic } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface HostnameListItemProps {
  hostname: Hostname
  election?: HostnameElection
  electionVote?: { choice: import('@/lib/api/client/elections').SentimentChoice }
  topic?: Topic
  isAdmin?: boolean
  signedOut?: boolean
  showVoteWidget?: boolean
}

export function HostnameListItem({
  hostname,
  election,
  electionVote,
  topic,
  isAdmin = false,
  signedOut = false,
  showVoteWidget = true,
}: HostnameListItemProps) {
  const t = useTranslations()
  return (
    <article className='rounded-md border bg-card p-4'>
      <div className='space-y-3'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <Link
              href={domainHref(hostname)}
              prefetch={false}
              className='text-xl font-semibold hover:underline'
              data-pw='domains-list-hostname-link'
            >
              {hostname.hostname}
            </Link>
            {election && (
              <DomainTrustBadge
                scoreNet={election.votes_score_net ?? 0}
                countUp={election.votes_count_up ?? 0}
                countDown={election.votes_count_down ?? 0}
                hostname={hostname.hostname}
                size='xs'
              />
            )}
            {isAdmin && hostname.blocked && (
              <span className='rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'>
                {t('extracted.domains.hostnameListItem.blocked_18f2a094')}
              </span>
            )}
            {isAdmin && hostname.crawlable === false && (
              <span className='rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'>
                {t('extracted.domains.hostnameListItem.notCrawlable_7171ab3b')}
              </span>
            )}
          </div>
          {topic && (
            <p className='mt-1 text-sm text-muted-foreground'>
              {t('extracted.domains.hostnameListItem.linkedTopic_828baa4e')}{' '}
              <TopicLabel topic={topic} />
            </p>
          )}
        </div>
        {election && showVoteWidget && (
          <HostnameVouchDisavowVote
            electionId={election.id}
            countUp={election.votes_count_up ?? 0}
            countDown={election.votes_count_down ?? 0}
            existingVoteChoice={electionVote?.choice}
            signedOut={signedOut}
          />
        )}
      </div>
    </article>
  )
}
