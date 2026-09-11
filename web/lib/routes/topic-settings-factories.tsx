/**
 * Factory functions for admin-only topic settings route sub-pages
 * that edit topic content: About (basic info + images) and Behavior (type + spending).
 *
 * For settings management sub-pages (domains, source, aliases, merge) see
 * topic-management-factories.tsx.
 */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import {
  resolveTypeAttributeNames,
  typesWithAttributes,
  type SpendingCategoryAttributes,
  type TopicEditState,
  type TypeAttributes,
} from '@/components/topics/settings/topic-edit-model'
import { AboutClient } from '@/components/topics/settings/about-client'
import { BehaviorClient } from '@/components/topics/settings/behavior-client'
import {
  getTopic,
  getTopicSpendingCategoryAttributes,
  getTopicTypeAttributesServer,
} from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getTranslations } from '@/lib/i18n/get-translations'
import { topicManagementHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTopicTypeLabelFromSlug, getTopicTypeSlug } from '@/types/topics'

interface AdminSubPageProps {
  params: Promise<{ id: string }>
}

async function loadSettingsData(id: string, slug: string) {
  const topicData = await getTopic(id)
  if (!topicData) notFound()

  const spendingRaw = await getTopicSpendingCategoryAttributes(id).catch(() => null)

  const topic = topicData.topic
  const spendingData = spendingRaw
    ? (spendingRaw.spending_category_attributes as SpendingCategoryAttributes)
    : null

  const currentType = topic.topic_type
  const typeSlug = currentType ? getTopicTypeSlug(currentType) : null
  const typeAttributes =
    currentType && typesWithAttributes.has(currentType) && typeSlug
      ? await getTopicTypeAttributesServer<TypeAttributes>(id, typeSlug).catch(() => null)
      : null

  const typeAttributeNames = await resolveTypeAttributeNames(
    typeAttributes,
    async topicId => (await getTopic(topicId))?.topic.name,
  )

  const initialData: Partial<TopicEditState> = {
    isForeignTransaction: spendingData?.is_foreign_transaction ?? false,
    loadError: null,
    loading: false,
    spendingFrequency: spendingData?.default_spending_frequency ?? '',
    topic,
    topicTypeValue: topic.topic_type ?? '',
    typeAttributes,
    typeAttributeNames,
    typeSaving: false,
  }

  return { topic, initialData, slug }
}

export function createTopicSettingsPage(slug: string) {
  async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations()
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettings_5235cb8d', {
        label: t(getTopicTypeLabelFromSlug(slug)),
      }),
    )
  }

  async function TopicSettingsRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()

    redirect(topicManagementHref(topicData.topic, 'settings/about'))
  }

  return { generateMetadata, default: TopicSettingsRoutePage }
}

export function createTopicSettingsAboutPage(slug: string) {
  async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations()
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettingsAbout_b55040c5', {
        label: t(getTopicTypeLabelFromSlug(slug)),
      }),
    )
  }

  async function TopicSettingsAboutRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const { initialData } = await loadSettingsData(id, slug)

    return (
      <AboutClient
        key={id}
        id={id}
        topicType={slug}
        initialData={initialData}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsAboutRoutePage }
}

export function createTopicSettingsBehaviorPage(slug: string) {
  async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations()
    return createNoIndexMetadata(
      t('extracted.topics.topicSettingsMetadata.labelSettingsBehavior_a054f7e0', {
        label: t(getTopicTypeLabelFromSlug(slug)),
      }),
    )
  }

  async function TopicSettingsBehaviorRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const { initialData } = await loadSettingsData(id, slug)

    return (
      <BehaviorClient
        key={id}
        id={id}
        topicType={slug}
        initialData={initialData}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsBehaviorRoutePage }
}
