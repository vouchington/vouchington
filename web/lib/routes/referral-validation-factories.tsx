import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminPagination } from '@/components/admin/admin-pagination'
import { ValidationForm } from '@/components/admin/referral-link-validations/validation-form'
import { ValidationRulesTable } from '@/components/admin/referral-link-validations/validation-rules-table'
import { ValidationsListTable } from '@/components/admin/referral-link-validations/validations-list-table'
import { Button } from '@/components/ui/button'
import type {
  ReferralLinkValidation,
  ReferralLinkValidationRule,
} from '@/lib/api/client/referral-link-validations'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import {
  getReferralProgramValidations,
  getTopic,
  referralProgramLinksValidation,
  serverApi,
} from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createTopicPathname, referralValidationHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Topic } from '@/types/topics'
import { isUUID } from '@ts-shared/utils/validation-core'

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

type NewPageProps = Pick<ListPageProps, 'params'>
interface ListPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ after?: string | string[] }>
}
interface DetailPageProps {
  params: Promise<{ id: string; validationId: string }>
}

export function createReferralProgramValidationsListPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('Referral Link Validations')
  }

  async function ReferralProgramValidationsListPage({ params, searchParams }: ListPageProps) {
    const { id } = await params
    const { topic, basePath } = await loadReferralProgram(id)
    if (isUUID(id)) permanentRedirect(basePath)
    const rawAfter = (await searchParams)?.after
    const after = Array.isArray(rawAfter) ? rawAfter[0] : rawAfter

    const [data, t] = await Promise.all([
      getReferralProgramValidations(topic.id, after),
      getTranslations(),
    ])
    return (
      <div className='space-y-4'>
        <AdminPageHeader
          title='Referral Link Validations'
          description='Manage referral link validation sets and rules'
        >
          <Button
            asChild
            size='sm'
            data-pw='referral-link-validations-new-button'
          >
            <Link
              href={`${basePath}/new`}
              prefetch={false}
            >
              New Validation
            </Link>
          </Button>
        </AdminPageHeader>
        <ValidationsListTable
          validations={data.results}
          programSlug={topic.slug}
          t={t}
        />
        <AdminPagination
          previousHref={after ? basePath : null}
          nextHref={
            data.page_info?.has_next_page && data.page_info.end_cursor
              ? `${basePath}?after=${encodeURIComponent(data.page_info.end_cursor)}`
              : null
          }
        />
      </div>
    )
  }

  return { generateMetadata, default: ReferralProgramValidationsListPage }
}

export function createReferralProgramValidationDetailPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('Referral Link Validation')
  }

  async function ReferralProgramValidationDetailPage({ params }: DetailPageProps) {
    const { id, validationId } = await params
    const { topic, basePath } = await loadReferralProgram(id)

    const validationData = await returnNullForMissingEntity(
      serverApi.get<{ validation: ReferralLinkValidation }>(
        `/api/v1/referral-link-validations/${validationId}`,
      ),
    )
    if (!validationData) notFound()
    // The resolved id, not the route segment, is what the keyset pages carry.
    const linked = await referralProgramLinksValidation(topic.id, validationData.validation.id)
    if (!linked) notFound()
    const { validation } = validationData
    if (isUUID(id) || isUUID(validationId)) {
      permanentRedirect(referralValidationHref(topic, validation))
    }

    const rulesData = await serverApi.get<{ results: ReferralLinkValidationRule[] }>(
      `/api/v1/referral-link-validations/${validation.id}/rules`,
      { searchParams: { limit: 100 } },
    )

    return (
      <div className='space-y-6'>
        <Link
          href={basePath}
          prefetch={false}
          className='mb-2 inline-block text-sm text-muted-foreground hover:underline'
        >
          ← Referral Link Validations
        </Link>
        <AdminPageHeader
          title={validation.slug}
          description={validation.user_help_text || undefined}
        />
        <div className='max-w-lg'>
          <h2
            className='mb-3 text-base font-semibold'
            data-pw='validation-edit-heading'
          >
            Edit Validation
          </h2>
          <ValidationForm
            existing={validation}
            programSlug={topic.slug}
          />
        </div>
        <ValidationRulesTable
          validationId={validation.id}
          initialRules={rulesData.results}
        />
      </div>
    )
  }

  return { generateMetadata, default: ReferralProgramValidationDetailPage }
}
