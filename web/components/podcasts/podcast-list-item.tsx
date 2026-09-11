'use client'

import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import Link from 'next/link'
import { Mic, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getRssFeedDisplayTitle } from '@/lib/topics/display-name'
import { topicHref, podcastCategoryHref } from '@/lib/links/entity-href'
import type { RssFeedListItemAction } from '@/components/sources/rss-feed-action-slot'
import { SourceListItemMeta } from '@/components/sources/source-list-item-meta'
import type { RssFeedTopicElection, ViewRssFeed } from '@/types/rss-feeds'
import type { HostnameElection } from '@/types/hostnames'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PodcastListItemProps {
  feed: ViewRssFeed
  action?: RssFeedListItemAction
  isFollowing?: boolean
  isFollowingTopic?: boolean
  hostnameElection?: HostnameElection
  topicElection?: RssFeedTopicElection
  electionVoteChoice?: import('@/lib/api/client/elections').SentimentChoice
  refreshOnUnfollow?: boolean
}

/**
 * Card for displaying a podcast show in a list (e.g. /podcasts hub, /my/podcasts).
 * Shows cover art, title, author, explicit badge, Apple category chips, and follow buttons.
 */
export function PodcastListItem({
  feed,
  action,
  isFollowing = false,
  isFollowingTopic = false,
  hostnameElection,
  topicElection,
  electionVoteChoice,
  refreshOnUnfollow,
}: PodcastListItemProps) {
  const t = useTranslations()
  const title = getRssFeedDisplayTitle(feed)
  const show = feed.podcast_show
  const coverArtUrl = show?.cover_art_url ?? null
  const author = show?.itunes_author ?? null
  const isExplicit = show?.is_explicit ?? false
  const categories = feed.categories ?? []
  const showHref = topicHref(feed.topic, 'latest')

  return (
    <article
      className='flex gap-4 rounded-md border bg-card p-4'
      data-pw='podcast-show-card'
    >
      <div className='shrink-0'>
        <Link
          href={showHref}
          prefetch={false}
          aria-label={title}
        >
          {coverArtUrl ? (
            <Image
              src={coverArtUrl}
              alt={t('extracted.podcasts.podcastListItem.titleCoverArt_2176bb35', { title })}
              width={80}
              height={80}
              className='rounded-md object-cover'
              data-pw='podcast-show-cover-art'
            />
          ) : (
            <div
              className='flex h-20 w-20 items-center justify-center rounded-md bg-muted'
              aria-hidden='true'
            >
              <Mic className='h-8 w-8 text-muted-foreground' />
            </div>
          )}
        </Link>
      </div>

      <div className='min-w-0 flex-1'>
        <h2 className='line-clamp-2 font-semibold leading-tight'>
          <Link
            href={showHref}
            prefetch={false}
            className='hover:underline'
            data-pw='podcast-show-title'
          >
            {title}
          </Link>
        </h2>

        {author && (
          <p
            className='mt-0.5 truncate text-sm text-muted-foreground'
            data-pw='podcast-show-author'
          >
            {author}
          </p>
        )}

        {(isExplicit || categories.length > 0) && (
          <div className='mt-2 flex flex-wrap items-center gap-1.5'>
            {isExplicit && (
              <Badge
                variant='secondary'
                className='gap-1 text-xs'
                data-pw='podcast-explicit-badge'
              >
                <Lock className='h-2.5 w-2.5' />
                {t('extracted.podcasts.podcastListItem.explicit_d863c482')}
              </Badge>
            )}
            {categories.slice(0, 3).map(cat => {
              const chip = (
                <Badge
                  variant='outline'
                  className={`text-xs capitalize${cat.topic_slug ? ' hover:bg-accent' : ''}`}
                  data-pw='podcast-category-chip'
                >
                  {cat.category_text}
                </Badge>
              )
              return cat.topic_slug ? (
                <Link
                  key={cat.category_text}
                  href={podcastCategoryHref(cat.topic_slug)}
                  prefetch={false}
                >
                  {chip}
                </Link>
              ) : (
                <span key={cat.category_text}>{chip}</span>
              )
            })}
          </div>
        )}

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
      </div>
    </article>
  )
}
