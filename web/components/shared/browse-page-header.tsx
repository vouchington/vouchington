'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import { TitleRouteDropdown } from '@/components/shared/title-route-dropdown'
import { useTranslations } from '@/lib/i18n/use-translations'

type BrowseRouteConfig = {
  title: MessageKey
  description: MessageKey
  path: string
  family: 'all-items' | 'all-sources'
}

const browseRouteConfigs = {
  news: {
    family: 'all-items' as const,
    path: '/news',
    title: 'extracted.shared.browsePageHeader.news_69752f23',
    description: 'extracted.shared.browsePageHeader.latestNewsFromAcrossTheWeb_64c5c26e',
  },
  'podcast-episodes': {
    family: 'all-items' as const,
    path: '/podcast-episodes',
    title: 'extracted.shared.browsePageHeader.podcastEpisodes_093bc80f',
    description: 'extracted.shared.browsePageHeader.latestPodcastEpisodesFromTheSources_c768349d',
  },
  videos: {
    family: 'all-items' as const,
    path: '/videos',
    title: 'extracted.shared.browsePageHeader.videos_c9a96394',
    description: 'extracted.shared.browsePageHeader.latestVideosFromTheChannelsYou_0b44ed38',
  },
  'news-sources': {
    family: 'all-sources' as const,
    path: '/news-sources',
    title: 'extracted.shared.browsePageHeader.newsSources_238ad263',
    description: 'extracted.shared.browsePageHeader.discoverNewsSourcesAndRssFeeds_fd6e3f70',
  },
  podcasts: {
    family: 'all-sources' as const,
    path: '/podcasts',
    title: 'extracted.shared.browsePageHeader.podcasts_6ac749b3',
    description: 'extracted.shared.browsePageHeader.discoverAndListenToPodcastEpisodes_57612c76',
  },
  channels: {
    family: 'all-sources' as const,
    path: '/channels',
    title: 'extracted.shared.browsePageHeader.channels_4c8906cf',
    description: 'extracted.shared.browsePageHeader.discoverVideoChannelsOnVoucha_f665db5e',
  },
} satisfies Record<string, BrowseRouteConfig>

export type BrowseRouteKey = keyof typeof browseRouteConfigs

const familyItems: Record<'all-items' | 'all-sources', BrowseRouteKey[]> = {
  'all-items': ['news', 'podcast-episodes', 'videos'],
  'all-sources': ['news-sources', 'podcasts', 'channels'],
}

interface BrowsePageHeaderProps {
  routeKey: BrowseRouteKey
  /** Optional text size class override, e.g. 'text-2xl tracking-tight' */
  titleClassName?: string
}

export function BrowsePageHeader({ routeKey, titleClassName }: BrowsePageHeaderProps) {
  const t = useTranslations()
  const config = browseRouteConfigs[routeKey]
  const items = familyItems[config.family].map(key => ({
    label: t(browseRouteConfigs[key].title),
    href: browseRouteConfigs[key].path,
    active: key === routeKey,
  }))

  return (
    <div>
      <h1
        data-pw='browse-page-heading'
        className='leading-none'
      >
        {items.length >= 2 ? (
          <TitleRouteDropdown
            label={t(config.title)}
            items={items}
            dataPw='browse-title-dropdown-trigger'
            className={titleClassName}
          />
        ) : (
          <span className='text-2xl font-semibold'>{t(config.title)}</span>
        )}
      </h1>
      {config.description && (
        <p
          data-pw='browse-page-description'
          className='mt-1 text-sm text-muted-foreground'
        >
          {t(config.description)}
        </p>
      )}
    </div>
  )
}
