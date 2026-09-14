/**
 * Factory function for the topic referral-links subpage.
 *
 * Closes over a hardcoded topicType/slug constant, eliminating the
 * runtime getTopicTypeFromSlug() check that was needed in the old catch-all
 * [topicType] dynamic segment.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { OfficialReferralLinkForm } from '@/components/admin/official-referral-links/official-referral-link-form'
import { ReferralLinkForm } from '@/components/referral-links/referral-link-form'
import { ReferralLinkList } from '@/components/referral-links/referral-link-list'
import { ReferralLinksShowAll } from '@/components/referral-links/referral-links-show-all'
import {
  getMyReferralLinks,
  getOfficialReferralLinks,
  getPrioritizedReferralLinks,
  getReferralProgramValidationInfo,
  getTopic,
} from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isAdmin, isOfficialAccount } from '@/lib/auth/official-account'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { createTopicSectionMetadata, createTopicSectionStructuredData } from '@/lib/seo/topic-pages'

export function createTopicReferralLinksPage(slug: string) {
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
        label: t('extracted.routes.topicReferralFactories.referralLinks_4348d2ad'),
        path: 'referral-links',
      })
    } catch {
      return createNoIndexMetadata()
    }
  }

  async function ReferralLinksRoutePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const [topicData, currentUser, t] = await Promise.all([
      getTopic(id),
      getCurrentUser(),
      getTranslations(),
    ])
    if (!topicData) notFound()

    const referralProgramId =
      topicData.topic.topic_type === 'referral_program'
        ? topicData.topic.id
        : topicData.topic.referral_program_id
    if (!referralProgramId) notFound()

    const isAdministrator = isAdmin(currentUser)

    const [response, myLinks, validationInfo, officialLinksData] = await Promise.all([
      getPrioritizedReferralLinks(referralProgramId),
      currentUser ? getMyReferralLinks(referralProgramId) : null,
      getReferralProgramValidationInfo(referralProgramId),
      isAdministrator ? getOfficialReferralLinks(referralProgramId) : null,
    ])

    const referralLinksLabel = t('extracted.routes.topicReferralFactories.referralLinks_4348d2ad')
    const structuredData = createTopicSectionStructuredData(
      t,
      topicData.topic,
      slug,
      { label: referralLinksLabel, path: 'referral-links' },
      topicData.topic_categories,
      topicData.topic_metrics,
    )

    const existingLink = myLinks?.results?.[0] ?? null
    const isOfficial = isOfficialAccount(currentUser)

    return (
      <>
        <AnonymousStructuredDataScript data={structuredData.topic} />
        <AnonymousStructuredDataScript data={structuredData.breadcrumbs} />
        <div className='space-y-6'>
          <h2
            className='text-2xl font-bold'
            data-pw='referral-links-page-heading'
          >
            {referralLinksLabel}
          </h2>
          {isAdministrator ? (
            <OfficialReferralLinkForm
              referralProgramId={referralProgramId}
              links={officialLinksData?.official_referral_links ?? []}
              validationInfo={validationInfo}
            />
          ) : isOfficial ? (
            <p
              className='text-sm text-muted-foreground'
              data-pw='official-account-referral-link-gate'
            >
              {t(
                'extracted.routes.topicReferralFactories.officialAccountsCannotPublishPersonalReferral_b2d345d9',
              )}
            </p>
          ) : currentUser ? (
            <ReferralLinkForm
              referralProgramId={referralProgramId}
              existingLink={existingLink}
              validationInfo={validationInfo}
            />
          ) : (
            <p className='text-sm text-muted-foreground'>
              <Link
                href='/login'
                prefetch={false}
                className='text-blue-600 hover:underline'
              >
                {t('extracted.routes.topicReferralFactories.signIn_bfd402b2')}
              </Link>{' '}
              {t(
                'extracted.routes.topicReferralFactories.toSeePersonalizedReferralLinksFrom_5798e5b7',
              )}
            </p>
          )}
          <ReferralLinkList
            t={t}
            response={response}
          />
          {currentUser && !isOfficial && (
            <ReferralLinksShowAll referralProgramId={referralProgramId} />
          )}
        </div>
      </>
    )
  }

  return { generateMetadata, default: ReferralLinksRoutePage }
}
