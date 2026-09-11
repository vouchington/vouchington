'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { domainHref, topicHref } from '@/lib/links/entity-href'
import { getRssFeedDisplayTitle } from '@/lib/topics/display-name'
import type { RssFeedTopicElection, ViewRssFeed } from '@/types/rss-feeds'
import type { HostnameElection } from '@/types/hostnames'
import type { RssFeedListItemAction } from './rss-feed-action-slot'
import { SourceListItemMeta } from './source-list-item-meta'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SourceListItemProps {
  feed: ViewRssFeed
  action?: RssFeedListItemAction
  isFollowing: boolean
  isFollowingTopic: boolean
  hostnameElection?: HostnameElection
  topicElection?: RssFeedTopicElection
  electionVoteChoice?: import('@/lib/api/client/elections').SentimentChoice
  refreshOnUnfollow?: boolean
}

export function SourceListItem({
  feed,
  action,
  isFollowing,
  isFollowingTopic,
  hostnameElection,
  topicElection,
  electionVoteChoice,
  refreshOnUnfollow,
}: SourceListItemProps) {
  const t = useTranslations()
  const title = getRssFeedDisplayTitle(feed)
  return (
    <article
      data-pw='source-list-item'
      className='rounded-md border bg-card p-4'
    >
      <div>
        <h2 className='text-xl font-semibold'>
          <Link
            href={topicHref(feed.topic, 'latest')}
            prefetch={false}
            className='hover:underline'
          >
            {title}
          </Link>
        </h2>
        {(feed.hostname || feed.home_page_url) && (
          <p className='mt-1 text-sm text-muted-foreground'>
            {feed.hostname && (
              <Link
                href={domainHref(feed.hostname)}
                prefetch={false}
                className='hover:underline'
              >
                {feed.hostname.hostname}
              </Link>
            )}
            {(feed.home_page_url?.url || feed.hostname) && (
              <>
                {' '}
                <a
                  href={feed.home_page_url?.url ?? `https://${feed.hostname!.hostname}/`}
                  target='_blank'
                  rel='nofollow noopener noreferrer'
                  aria-label={t('extracted.sources.sourceListItem.openHostnameHomepage_6967d82f', {
                    hostname: feed.hostname?.hostname ?? title,
                  })}
                  className='inline-flex min-h-6 min-w-6 items-center justify-center'
                >
                  <ExternalLink className='h-3 w-3 shrink-0 text-muted-foreground' />
                </a>
              </>
            )}
          </p>
        )}
      </div>
      <SourceListItemMeta
        feed={feed}
        action={action}
        isFollowing={isFollowing}
        isFollowingTopic={isFollowingTopic}
        hostnameElection={hostnameElection}
        topicElection={topicElection}
        electionVoteChoice={electionVoteChoice}
        refreshOnUnfollow={refreshOnUnfollow}
      />
    </article>
  )
}
