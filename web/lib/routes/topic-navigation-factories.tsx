/**
 * Factory functions for topic navigation subpage routes (latest, news, discussions).
 *
 * Each factory closes over a hardcoded topicType/slug constant, eliminating the
 * runtime getTopicTypeFromSlug() check that was needed in the old catch-all
 * [topicType] dynamic segment.
 */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { TopicLatestPage } from '@/components/topics/topic-latest-page'
import { TopicNewsPage } from '@/components/topics/topic-news-page'
import { getTopic } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { createTopicSectionMetadata, createTopicSectionStructuredData } from '@/lib/seo/topic-pages'

interface SubPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function createTopicLatestPage(slug: string) {
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ id: string }>
  }): Promise<Metadata> {
    const { id } = await params
    try {
      const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
      if (!topicData) return createNoIndexMetadata()
      return createTopicSectionMetadata(topicData.topic, slug, {
        label: t('extracted.routes.topicNavigationFactories.latest_8730d3c2'),
        path: 'latest',
        rssUrl: `/rss/news?sources=${encodeURIComponent(topicData.topic.slug)}`,
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function TopicLatestRoutePage({ params, searchParams }: SubPageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
    if (!topicData) notFound()
    const structuredData = createTopicSectionStructuredData(
      topicData.topic,
      slug,
      { label: t('extracted.routes.topicNavigationFactories.latest_8730d3c2'), path: 'latest' },
      topicData.topic_categories,
      topicData.topic_metrics,
    )

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <TopicLatestPage
          id={id}
          pathname={`/${slug}/${id}/latest`}
          searchParams={resolvedSearchParams}
        />
      </>
    )
  }

  return { generateMetadata, default: TopicLatestRoutePage }
}

export function createTopicNewsPage(slug: string) {
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ id: string }>
  }): Promise<Metadata> {
    const { id } = await params
    try {
      const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
      if (!topicData) return createNoIndexMetadata()
      return createTopicSectionMetadata(topicData.topic, slug, {
        label: t('extracted.routes.topicNavigationFactories.news_69752f23'),
        path: 'news',
        rssUrl: `/rss/news?category_topic=${encodeURIComponent(topicData.topic.slug)}`,
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function TopicNewsRoutePage({ params, searchParams }: SubPageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
    if (!topicData) notFound()
    const structuredData = createTopicSectionStructuredData(
      topicData.topic,
      slug,
      { label: t('extracted.routes.topicNavigationFactories.news_69752f23'), path: 'news' },
      topicData.topic_categories,
      topicData.topic_metrics,
    )

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <TopicNewsPage
          id={id}
          pathname={`/${slug}/${id}/news`}
          searchParams={resolvedSearchParams}
        />
      </>
    )
  }

  return { generateMetadata, default: TopicNewsRoutePage }
}

export function createTopicDiscussionsPage(slug: string) {
  async function TopicDiscussionsRoutePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    redirect(`/${slug}/${id}/posts`)
  }

  return { default: TopicDiscussionsRoutePage }
}
