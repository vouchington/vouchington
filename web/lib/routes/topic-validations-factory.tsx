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
}

export function createTopicSettingsValidationsPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('Referral Program Settings - Validations')
  }

  async function TopicSettingsValidationsRoutePage({ params }: AdminSubPageProps) {
    await requireAdmin()

    const { id } = await params
    const topicData = await getTopic(id)
    if (!topicData) notFound()
    if (topicData.topic.topic_type !== 'referral_program') notFound()

    // Use the canonical UUID (not the URL slug) for API calls that require UUID
    const topicId = topicData.topic.id

    const validationsData = await returnNullForMissingEntity(
      serverApi.get<{ results: ReferralLinkValidation[] }>(
        `/api/v1/topics/${topicId}/referral-program/validations`,
      ),
    )
    if (!validationsData) notFound()

    const linkedValidations = validationsData.results

    return (
      <ReferralValidationsSettings
        key={id}
        referralProgramId={topicData.topic.id}
        linkedValidations={linkedValidations}
        validationsBasePath={createTopicPathname(topicData.topic, '/validations')}
      />
    )
  }

  return { generateMetadata, default: TopicSettingsValidationsRoutePage }
}
