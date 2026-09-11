/**
 * Factory functions for referral-link-validation management pages, scoped under a
 * Referral Program topic: `/referral-program/:id/validations[/new|/:validationId]`.
 *
 * Every factory gates with `requireAdmin()`, then `notFound()`s unless the resolved
 * topic's `topic_type === 'referral_program'`. The list route shows validations linked to
 * the program; the new route creates and links a validation in one step.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ValidationForm } from '@/components/admin/referral-link-validations/validation-form'
import { ValidationRulesTable } from '@/components/admin/referral-link-validations/validation-rules-table'
import { ValidationsListTable } from '@/components/admin/referral-link-validations/validations-list-table'
import { Button } from '@/components/ui/button'
import type {
  ReferralLinkValidation,
  ReferralLinkValidationRule,
} from '@/lib/api/client/referral-link-validations'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { getTopic, getReferralProgramValidations, serverApi } from '@/lib/api/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createTopicPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Topic } from '@/types/topics'

interface ListPageProps {
  params: Promise<{ id: string }>
}
interface DetailPageProps {
  params: Promise<{ id: string; validationId: string }>
}

/** Resolve + gate the referral program for `id`; returns the topic and its validations base path. */
async function loadReferralProgram(id: string): Promise<{ topic: Topic; basePath: string }> {
  await requireAdmin()
  const topicData = await getTopic(id)
  if (!topicData) notFound()
  if (topicData.topic.topic_type !== 'referral_program') notFound()
  return { topic: topicData.topic, basePath: createTopicPathname(topicData.topic, '/validations') }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function createReferralProgramValidationsListPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('Referral Link Validations')
  }

  async function ReferralProgramValidationsListPage({ params }: ListPageProps) {
    const { id } = await params
    const { topic, basePath } = await loadReferralProgram(id)

    const data = await getReferralProgramValidations(topic.id)

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
          basePath={basePath}
        />
      </div>
    )
  }

  return { generateMetadata, default: ReferralProgramValidationsListPage }
}

// ---------------------------------------------------------------------------
// New
// ---------------------------------------------------------------------------

export function createReferralProgramValidationNewPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('New Referral Link Validation')
  }

  async function NewReferralProgramValidationPage({ params }: ListPageProps) {
    const { id } = await params
    const { topic, basePath } = await loadReferralProgram(id)

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
            basePath={basePath}
            referralProgramId={topic.id}
          />
        </div>
      </div>
    )
  }

  return { generateMetadata, default: NewReferralProgramValidationPage }
}

// ---------------------------------------------------------------------------
// Detail (edit + rules)
// ---------------------------------------------------------------------------

export function createReferralProgramValidationDetailPage() {
  async function generateMetadata(): Promise<Metadata> {
    return createNoIndexMetadata('Referral Link Validation')
  }

  async function ReferralProgramValidationDetailPage({ params }: DetailPageProps) {
    const { id, validationId } = await params
    const { topic, basePath } = await loadReferralProgram(id)

    const [validationData, programValidations] = await Promise.all([
      returnNullForMissingEntity(
        serverApi.get<{ validation: ReferralLinkValidation }>(
          `/api/v1/referral-link-validations/${validationId}`,
        ),
      ),
      getReferralProgramValidations(topic.id),
    ])
    if (!validationData) notFound()
    // Guard: ensure the validation is linked to this program. Use the resolved UUID (not the
    // raw route segment, which may be a slug) so slug-based detail URLs still work.
    if (!programValidations.results.some(v => v.id === validationData.validation.id)) notFound()
    const { validation } = validationData

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
            basePath={basePath}
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
