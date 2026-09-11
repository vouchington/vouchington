'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import { CommandGroup } from '@/components/ui/command'
import { topicHref } from '@/lib/links/entity-href'
import { humanizePostType, generateExcerpt } from '@ts-shared/utils/format'
import { getTopicDisplayTitle } from '@/lib/topics/display-name'
import { getTopicTypeLabel } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { getPostRoute, type SearchResults, type SearchTab } from '../command-search-data'
import { CommandLinkItem } from './command-link-item'
import {
  NewsResults,
  DomainResults,
  CommunityResults,
  FediverseResults,
} from './result-groups-extra'

interface Shortcut {
  href: string
  label: MessageKey
  dataPw: string
}

interface ResultGroupsProps {
  activeTab: SearchTab
  matchedShortcuts: Shortcut[]
  results: SearchResults
  onOpenChange: (open: boolean) => void
  pushRoute: (href: string) => void
}

export function ResultGroups({
  activeTab,
  matchedShortcuts,
  results,
  onOpenChange,
  pushRoute,
}: ResultGroupsProps) {
  const t = useTranslations()
  return (
    <>
      {matchedShortcuts.length > 0 && (activeTab === 'all' || activeTab === 'pages') && (
        <CommandGroup heading={t('extracted.commandSearch.resultGroups.pages_9046da16')}>
          {matchedShortcuts.map(shortcut => (
            <CommandLinkItem
              key={shortcut.href}
              href={shortcut.href}
              external={false}
              dataPw={shortcut.dataPw}
              label={{ kind: 'ui-text', text: t(shortcut.label) }}
              sublabel={shortcut.href}
              onOpenChange={onOpenChange}
              pushRoute={pushRoute}
            />
          ))}
        </CommandGroup>
      )}
      <TopicResults
        activeTab={activeTab}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
        results={results}
      />
      <CommunityResults
        activeTab={activeTab}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
        results={results}
      />
      <PostResults
        activeTab={activeTab}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
        results={results}
      />
      <NewsResults
        activeTab={activeTab}
        onOpenChange={onOpenChange}
        results={results}
      />
      <DomainResults
        activeTab={activeTab}
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
        results={results}
      />
      <FediverseResults
        activeTab={activeTab}
        onOpenChange={onOpenChange}
        results={results}
      />
    </>
  )
}

function TopicResults({
  activeTab,
  onOpenChange,
  pushRoute,
  results,
}: Omit<ResultGroupsProps, 'matchedShortcuts'>) {
  const t = useTranslations()
  if (results.topics.length === 0 || (activeTab !== 'all' && activeTab !== 'topics')) return null
  return (
    <CommandGroup
      heading={t('extracted.commandSearch.resultGroups.topics_e22820fc')}
      data-pw='search-group-topics'
    >
      {results.topics.map(topic => (
        <CommandLinkItem
          key={topic.id}
          href={topicHref(topic)}
          external={false}
          label={{ kind: 'ui-text', text: getTopicDisplayTitle(topic) }}
          sublabel={t(getTopicTypeLabel(topic.topic_type))}
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      ))}
    </CommandGroup>
  )
}

function PostResults({
  activeTab,
  onOpenChange,
  pushRoute,
  results,
}: Omit<ResultGroupsProps, 'matchedShortcuts'>) {
  const t = useTranslations()
  if (results.posts.length === 0 || (activeTab !== 'all' && activeTab !== 'posts')) return null
  return (
    <CommandGroup
      heading={t('extracted.commandSearch.resultGroups.posts_a80811cf')}
      data-pw='search-group-posts'
    >
      {results.posts.map(post => (
        <CommandLinkItem
          key={post.id}
          href={`/${getPostRoute(post.post_type)}/${post.id}`}
          external={false}
          label={getPostCommandLabel(
            post,
            t('extracted.commandSearch.resultGroups.untitledPost_2e2fc1fc'),
          )}
          sublabel={humanizePostType(post.post_type)}
          onOpenChange={onOpenChange}
          pushRoute={pushRoute}
        />
      ))}
    </CommandGroup>
  )
}

function getPostCommandLabel(post: SearchResults['posts'][number], untitledFallback: string) {
  const content =
    'authored_title' in post
      ? post.authored_title
      : post.title || generateExcerpt(post.markdown, 80)
  return {
    kind: 'post-content' as const,
    content: {
      text: content,
      declared_language: post.declared_language,
      lingua_rs_detected_language: post.lingua_rs_detected_language,
    },
    fallback: 'authored_title' in post ? post.title : untitledFallback,
  }
}
