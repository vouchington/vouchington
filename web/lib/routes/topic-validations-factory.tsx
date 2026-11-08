/**
 * Factory function for the referral-program settings/validations sub-page route.
 * Extracted to keep topic-management-factories.tsx under the 200-line limit.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { getTopic, serverApi } from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createTopicPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ReferralValidationsSettings } from '@/components/topics/settings/referral-validations-settings'

interface AdminSubPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ after?: string | string[] }>
}

export function createTopicSettingsValidationsPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('Referral Program Settings - Validations')
  }

  async function TopicSettingsValidationsRoutePage({ params, searchParams }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()
    if (topicData.topic.topic_type !== 'referral_program') notFound()

    // Use the canonical UUID (not the URL slug) for API calls that require UUID
    const topicId = topicData.topic.id
    const rawAfter = (await searchParams)?.after
    const after = Array.isArray(rawAfter) ? rawAfter[0] : rawAfter
    const settingsPath = createTopicPathname(topicData.topic, '/settings/validations')

    const validationsData = await returnNullForMissingEntity(
      serverApi.get<{
        results: ReferralLinkValidation[]
        page_info?: { has_next_page: boolean; end_cursor: string | null }
      }>(`/api/v1/topics/${topicId}/referral-program/validations`, {
        searchParams: after ? { limit: 100, after } : { limit: 100 },
      }),
    )
    if (!validationsData) notFound()

    const pageInfo = validationsData.page_info
    return (
      <ReferralValidationsSettings
        key={id}
        referralProgramId={topicData.topic.id}
        linkedValidations={validationsData.results}
        validationsBasePath={createTopicPathname(topicData.topic, '/validations')}
        previousHref={after ? settingsPath : null}
        nextHref={
          pageInfo?.has_next_page && pageInfo.end_cursor
            ? `${settingsPath}?after=${encodeURIComponent(pageInfo.end_cursor)}`
            : null
        }
      />
    )
  }

  return { generateMetadata, default: TopicSettingsValidationsRoutePage }
}
