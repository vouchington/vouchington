'use client'

import { CommandGroup, CommandItem } from '@/components/ui/command'
import { decodeHtmlEntities } from '@ts-shared/utils/html'
import { appendUtm, isExternalHref, isHttpHref, OUTBOUND_UTM } from '@/lib/url/utm'
import { communityHref, domainHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { SearchResults, SearchTab } from '../command-search-data'
import { CommandLinkItem } from './command-link-item'

interface CommonProps {
  activeTab: SearchTab
  onOpenChange: (open: boolean) => void
  results: SearchResults
}

export function NewsResults({ activeTab, onOpenChange, results }: CommonProps) {
  const t = useTranslations()
  if (results.news.length === 0 || (activeTab !== 'all' && activeTab !== 'news')) return null
  return (
    <CommandGroup
      heading={t('extracted.commandSearch.resultGroupsExtra.news_69752f23')}
      data-pw='search-group-news'
    >
      {results.news.map(item => (
        <CommandLinkItem
          key={item.id}
          href={isExternalHref(item.url.url) ? appendUtm(item.url.url, OUTBOUND_UTM) : item.url.url}
          external
          label={{
            kind: 'ui-text',
            text: decodeHtmlEntities(
              item.data.title || t('extracted.commandSearch.resultGroupsExtra.untitled_f59ab8d1'),
            ),
          }}
          sublabel={item.rss_feed.title}
          onOpenChange={onOpenChange}
        />
      ))}
    </CommandGroup>
  )
}

export function CommunityResults({
  activeTab,
  onOpenChange,
  pushRoute,
  results,
}: CommonProps & { pushRoute: (href: string) => void }) {
  const t = useTranslations()
  if (results.communities.length === 0 || (activeTab !== 'all' && activeTab !== 'communities'))
    return null
  return (
    <CommandGroup
      heading={t('extracted.commandSearch.resultGroupsExtra.communities_c864f329')}
      data-pw='search-group-communities'
    >
      {results.communities.map(community => (
        <CommandLinkItem
          key={community.id}
          href={communityHref(community)}
          external={false}
          label={{ kind: 'ui-text', text: community.name }}
          sublabel={t('extracted.commandSearch.resultGroupsExtra.community_bb501d78')}
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      ))}
    </CommandGroup>
  )
}

export function DomainResults({
  activeTab,
  onOpenChange,
  pushRoute,
  results,
}: CommonProps & { pushRoute: (href: string) => void }) {
  const t = useTranslations()
  if (results.domains.length === 0 || (activeTab !== 'all' && activeTab !== 'domains')) return null
  return (
    <CommandGroup
      heading={t('extracted.commandSearch.resultGroupsExtra.domains_ced67718')}
      data-pw='search-group-domains'
    >
      {results.domains.map(hostname => (
        <CommandLinkItem
          key={hostname.id}
          href={domainHref(hostname)}
          external={false}
          label={{ kind: 'ui-text', text: hostname.hostname }}
          sublabel={t('extracted.commandSearch.resultGroupsExtra.domain_79fa3361')}
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      ))}
    </CommandGroup>
  )
}

export function FediverseResults({ activeTab, onOpenChange, results }: CommonProps) {
  const t = useTranslations()
  if (results.fediverse.length === 0 || (activeTab !== 'all' && activeTab !== 'fediverse'))
    return null
  return (
    <CommandGroup
      heading={t('extracted.commandSearch.resultGroupsExtra.fediverse_5b02ab9d')}
      data-pw='search-group-fediverse'
    >
      {results.fediverse.map(item => {
        const sublabel = `${formatProvider(item.provider)} · ${item.source_hostname}`
        return isHttpHref(item.external_url) ? (
          <CommandLinkItem
            key={`${item.provider}:${item.external_url}`}
            href={appendUtm(item.external_url, OUTBOUND_UTM)}
            external
            label={{ kind: 'ui-text', text: item.title }}
            sublabel={sublabel}
            onOpenChange={onOpenChange}
          />
        ) : (
          <CommandItem key={`${item.provider}:${item.external_url}`}>
            <div className='flex flex-col'>
              <span className='font-medium'>{item.title}</span>
              <span className='text-xs text-muted-foreground'>{sublabel}</span>
            </div>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}

function formatProvider(provider: string): string {
  switch (provider) {
    case 'peertube':
      return 'PeerTube'
    case 'mastodon':
      return 'Mastodon'
    case 'bluesky':
      return 'Bluesky'
    default:
      return provider
  }
}
