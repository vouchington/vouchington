/**
 * Factory functions for topic navigation subpage routes (latest, news, discussions).
 *
 * Each factory closes over a hardcoded topicType/slug constant, eliminating the
 * runtime getTopicTypeFromSlug() check that was needed in the old catch-all
 * [topicType] dynamic segment. Latest and news share one section-page factory;
 * only the section label, path, RSS query, and page component differ.
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

type TopicSectionPageComponent = typeof TopicLatestPage

interface TopicSectionPageConfig {
  slug: string
  path: 'latest' | 'news'
  rssSearchParam: 'sources' | 'category_topic'
  label: (t: Awaited<ReturnType<typeof getTranslations>>) => string
  Page: TopicSectionPageComponent
}

function createTopicSectionPage({
  slug,
  path,
  rssSearchParam,
  label,
  Page,
}: TopicSectionPageConfig) {
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
        label: label(t),
        path,
        rssUrl: `/rss/news?${rssSearchParam}=${encodeURIComponent(topicData.topic.slug)}`,
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function render({ params, searchParams }: SubPageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
    if (!topicData) notFound()
    const structuredData = createTopicSectionStructuredData(
      t,
      topicData.topic,
      slug,
      { label: label(t), path },
      topicData.topic_categories,
      topicData.topic_metrics,
    )

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <Page
          id={id}
          pathname={`/${slug}/${id}/${path}`}
          searchParams={resolvedSearchParams}
        />
      </>
    )
  }

  return { generateMetadata, render }
}

export function createTopicLatestPage(slug: string) {
  const section = createTopicSectionPage({
    slug,
    path: 'latest',
    rssSearchParam: 'sources',
    label: t => t('extracted.routes.topicNavigationFactories.latest_8730d3c2'),
    Page: TopicLatestPage,
  })

  async function TopicLatestRoutePage(props: SubPageProps) {
    return section.render(props)
  }

  return { generateMetadata: section.generateMetadata, default: TopicLatestRoutePage }
}

export function createTopicNewsPage(slug: string) {
  const section = createTopicSectionPage({
    slug,
    path: 'news',
    rssSearchParam: 'category_topic',
    label: t => t('extracted.routes.topicNavigationFactories.news_69752f23'),
    Page: TopicNewsPage,
  })

  async function TopicNewsRoutePage(props: SubPageProps) {
    return section.render(props)
  }

  return { generateMetadata: section.generateMetadata, default: TopicNewsRoutePage }
}

export function createTopicDiscussionsPage(slug: string) {
  async function TopicDiscussionsRoutePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    redirect(`/${slug}/${id}/posts`)
  }

  return { default: TopicDiscussionsRoutePage }
}
