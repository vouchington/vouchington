/** Topic subpage route factories. Each closes over a hardcoded topicType/slug. */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { TopicDataPointsPage } from '@/components/topics/topic-data-points-page'
import { TopicPostsPage } from '@/components/topics/topic-posts-page'
import { TopicReviewsPage } from '@/components/topics/topic-reviews-page'
import { getTopic } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { buildTopicPostsRssUrl } from '@/lib/seo/posts-rss-url'
import {
  createTopicReviewSectionStructuredData,
  createTopicSectionMetadata,
  createTopicSectionStructuredData,
} from '@/lib/seo/topic-pages'
import { getDefaultTopicSubpage } from '@/lib/topic-default-subpage'

interface RootPageProps {
  params: Promise<{ id: string }>
}

interface SubPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export function createTopicRootPage(slug: string) {
  // The root page always redirects so its metadata is never served; the direct
  // assignment satisfies both the lint rules and this no-op metadata requirement.
  const generateMetadata = createNoIndexMetadata

  async function TopicRootPage({ params }: RootPageProps) {
    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()
    const defaultSubpage = getDefaultTopicSubpage(topicData.topic_metrics, topicData.topic)
    redirect(`/${slug}/${id}/${defaultSubpage}`)
  }

  return { generateMetadata, default: TopicRootPage }
}

export function createTopicPostsPage(slug: string) {
  async function generateMetadata({ params, searchParams }: SubPageProps): Promise<Metadata> {
    const { id } = await params
    try {
      const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
      if (!topicData) return createNoIndexMetadata()
      const resolvedSearchParams = await searchParams
      return createTopicSectionMetadata(topicData.topic, slug, {
        label: t('extracted.routes.topicSubpageFactories.posts_a80811cf'),
        path: 'posts',
        rssUrl: buildTopicPostsRssUrl(topicData.topic.slug, resolvedSearchParams),
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function TopicPostsRoutePage({ params, searchParams }: SubPageProps) {
    const { id } = await params
    const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
    if (!topicData) notFound()
    const resolvedSearchParams = await searchParams
    const structuredData = createTopicSectionStructuredData(
      t,
      topicData.topic,
      slug,
      { label: t('extracted.routes.topicSubpageFactories.posts_a80811cf'), path: 'posts' },
      topicData.topic_categories,
      topicData.topic_metrics,
    )

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <TopicPostsPage
          id={topicData.topic.id}
          searchParams={resolvedSearchParams}
        />
      </>
    )
  }

  return { generateMetadata, default: TopicPostsRoutePage }
}

export function createTopicReviewsPage(slug: string) {
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ id: string }>
  }): Promise<Metadata> {
    const { id } = await params
    try {
      const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
      if (!topicData) return createNoIndexMetadata()
      // noindex is handled centrally in createTopicSectionMetadata; reviews additionally
      // noindex/404 when reviews are disabled.
      if (!topicData.topic.allow_reviews) return createNoIndexMetadata()
      return createTopicSectionMetadata(topicData.topic, slug, {
        label: t('extracted.routes.topicSubpageFactories.reviews_84cb7871'),
        path: 'reviews',
        rssUrl: `/rss/posts?topics=${encodeURIComponent(topicData.topic.slug)}&post_type=review`,
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function TopicReviewsRoutePage({ params, searchParams }: SubPageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
    if (!topicData) notFound()
    if (!topicData.topic.allow_reviews) notFound()
    const structuredData = createTopicReviewSectionStructuredData(
      t,
      topicData.topic,
      slug,
      topicData.topic_metrics ?? null,
      t('extracted.routes.topicSubpageFactories.reviews_84cb7871'),
      topicData.topic_categories,
    )

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <TopicReviewsPage
          id={topicData.topic.id}
          searchParams={resolvedSearchParams}
        />
      </>
    )
  }

  return { generateMetadata, default: TopicReviewsRoutePage }
}

export function createTopicDataPointsPage(slug: string) {
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
        label: t('extracted.routes.topicSubpageFactories.dataPoints_1da65e3a'),
        path: 'data-points',
        rssUrl: `/rss/posts?topics=${encodeURIComponent(topicData.topic.slug)}&post_type=data_point`,
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function TopicDataPointsRoutePage({ params, searchParams }: SubPageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const [topicData, t] = await Promise.all([getTopic(id), getTranslations()])
    if (!topicData) notFound()
    const structuredData = createTopicSectionStructuredData(
      t,
      topicData.topic,
      slug,
      {
        label: t('extracted.routes.topicSubpageFactories.dataPoints_1da65e3a'),
        path: 'data-points',
      },
      topicData.topic_categories,
      topicData.topic_metrics,
    )

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <TopicDataPointsPage
          id={id}
          searchParams={resolvedSearchParams}
        />
      </>
    )
  }

  return { generateMetadata, default: TopicDataPointsRoutePage }
}
