export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getAllMyReferralLinks, getMembership } from '@/lib/api/server'
import { hasPlusTier } from '@/lib/memberships/has-plus-tier'
import { ReferralLinksManager } from '@/components/my/referral-links-manager'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Referral Links')

export default async function MyReferralLinksPage() {
  const t = await getTranslations()
  const [data, membershipData] = await Promise.all([getAllMyReferralLinks(), getMembership()])

  return (
    <div className='space-y-4'>
      <SettingsPageHeader
        title={t('extracted.referralLinks.page.referralLinks_4348d2ad')}
        description={t(
          'extracted.referralLinks.page.manageYourReferralLinksAcrossAllPrograms_6f708192',
        )}
      />
      {data === null ? (
        <p className='rounded-lg border p-6 text-center text-sm text-destructive'>
          {t('extracted.referralLinks.page.failedToLoadReferralLinksPlease_ecb29321')}
        </p>
      ) : (
        <ReferralLinksManager
          initialLinks={data.results}
          initialPageInfo={data.page_info}
          hasPlusTier={hasPlusTier(membershipData.membership)}
        />
      )}
    </div>
  )
}
