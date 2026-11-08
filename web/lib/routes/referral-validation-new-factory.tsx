/** New-validation page for an admin referral program. */

import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ValidationForm } from '@/components/admin/referral-link-validations/validation-form'
import { getTopic } from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createTopicPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Topic } from '@/types/topics'
import { isUUID } from '@ts-shared/utils/validation-core'

interface NewPageProps {
  params: Promise<{ id: string }>
}

/** Resolve + gate the referral program for `id`; returns the topic and its validations base path. */
export async function loadReferralProgram(id: string): Promise<{ topic: Topic; basePath: string }> {
  await requireAdmin()
  const topicData = await getTopic(id)
  if (!topicData) notFound()
  if (topicData.topic.topic_type !== 'referral_program') notFound()
  return { topic: topicData.topic, basePath: createTopicPathname(topicData.topic, '/validations') }
}

export function createReferralProgramValidationNewPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('New Referral Link Validation')
  }

  async function NewReferralProgramValidationPage({ params }: NewPageProps) {
    const { id } = await params
    const { topic, basePath } = await loadReferralProgram(id)
    if (isUUID(id)) permanentRedirect(createTopicPathname(topic, '/validations/new'))

    return (
      <div className='space-y-4'>
        <Link
          href={basePath}
          prefetch={false}
          className='mb-2 inline-block text-sm text-muted-foreground hover:underline'
        >
          ← Referral Link Validations
        </Link>
        <AdminPageHeader
          title='New Referral Link Validation'
          description='Create a new validation set for referral links'
        />
        <div className='max-w-lg'>
          <ValidationForm
            programSlug={topic.slug}
            referralProgramId={topic.id}
          />
        </div>
      </div>
    )
  }

  return { generateMetadata, default: NewReferralProgramValidationPage }
}
