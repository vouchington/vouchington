/**
 * Factory functions for admin-only topic management sub-page routes:
 * Domains, Source (RSS), Aliases, and Merge pages.
 *
 * For source crawl pages see topic-source-crawl-factories.tsx.
 * For topic settings content sub-pages (index redirect, About, Behavior) see
 * topic-settings-factories.tsx.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AliasesClient } from '@/components/topics/aliases/aliases-client'
import {
  toPrimaryHostname,
  type ManageSourceRssFeed,
  type ManageSourceState,
} from '@/components/topics/manage-source/manage-source-model'
import { DomainsClient } from '@/components/topics/settings/domains-client'
import { MergeClient } from '@/components/topics/settings/merge-client'
import { SourceClient } from '@/components/topics/settings/source-client'
import {
  getServerRssFeedCrawls,
  getTopic,
  getTopicAdditionalHostnames,
  getTopicAliases,
  getTopicRssFeeds,
} from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { RssFeedCrawlSummary } from '@/types/rss-feeds'
import { getTopicTypeLabel, topicTypes } from '@/types/topics'
import type { MessageKey } from '@ts-shared/ui-messages'

interface AdminSubPageProps {
  params: Promise<{ id: string }>
}

async function getTopicLabel(id: string): Promise<MessageKey> {
  const topicData = await getTopic(id).catch(() => null)
  return topicData ? getTopicTypeLabel(topicData.topic.topic_type) : topicTypes.topic.label
}

export function createTopicSettingsDomainsPage() {
  async function generateMetadata({ params }: AdminSubPageProps): Promise<Metadata> {
    const { id } = await params
    const [label, t] = await Promise.all([getTopicLabel(id), getTranslations()])
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettingsDomains_05ea015e', {
        label: t(label),
      }),
    )
  }

  async function TopicSettingsDomainsRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()

    const additionalHostnamesData = await getTopicAdditionalHostnames(id)

    const initialData: Partial<ManageSourceState> = {
      additionalHostnames: additionalHostnamesData.results,
      additionalHostnamesPageInfo: additionalHostnamesData.page_info,
      loading: false,
      primaryHostname: toPrimaryHostname(topicData.topic),
      topicName: topicData.topic.name,
    }

    return (
      <DomainsClient
        key={id}
        id={id}
        initialData={initialData}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsDomainsRoutePage }
}

export function createTopicSettingsSourcePage() {
  async function generateMetadata({ params }: AdminSubPageProps): Promise<Metadata> {
    const { id } = await params
    const [label, t] = await Promise.all([getTopicLabel(id), getTranslations()])
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettingsRssFeed_627f067e', {
        label: t(label),
      }),
    )
  }

  async function TopicSettingsSourceRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()
    if (topicData.topic.topic_type !== 'rss_feed') notFound()

    const feedData = await getTopicRssFeeds<ManageSourceRssFeed>(id, {
      enabled: null,
      discoverable: null,
    })

    const rssFeed = feedData.results[0] ?? null
    const crawls: RssFeedCrawlSummary[] = rssFeed
      ? await getServerRssFeedCrawls<RssFeedCrawlSummary>(rssFeed.id)
          .then(data => data.results)
          .catch(() => [])
      : []

    const initialData: Partial<ManageSourceState> = {
      crawls,
      loading: false,
      rssFeed,
      topicName: topicData.topic.name,
    }

    return (
      <SourceClient
        key={id}
        id={id}
        initialData={initialData}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsSourceRoutePage }
}

export function createTopicSettingsAliasesPage() {
  async function generateMetadata({ params }: AdminSubPageProps): Promise<Metadata> {
    const { id } = await params
    const [label, t] = await Promise.all([getTopicLabel(id), getTranslations()])
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettingsAliases_c812c15f', {
        label: t(label),
      }),
    )
  }

  async function TopicSettingsAliasesRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()
    const aliasesData = await getTopicAliases(id)

    return (
      <AliasesClient
        key={id}
        topic={topicData.topic}
        initialData={aliasesData}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsAliasesRoutePage }
}

export function createTopicSettingsMergePage() {
  async function generateMetadata({ params }: AdminSubPageProps): Promise<Metadata> {
    const { id } = await params
    const [label, t] = await Promise.all([getTopicLabel(id), getTranslations()])
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettingsMerge_b1d9106a', {
        label: t(label),
      }),
    )
  }

  async function TopicSettingsMergeRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()

    return (
      <MergeClient
        key={id}
        topic={topicData.topic}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsMergeRoutePage }
}

export { createTopicSettingsValidationsPage } from './topic-validations-factory'
export {
  createTopicSourceCrawlsPage,
  createTopicSourceCrawlDetailPage,
} from './topic-source-crawl-factories'
