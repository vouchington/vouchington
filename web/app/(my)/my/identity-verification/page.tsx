export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMyIdentityVerification } from '@/lib/api/server/my'
import { IdentityVerificationContent } from './identity-verification-content'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { formatVerificationFee } from './verification-fee'

export const metadata: Metadata = createNoIndexMetadata('Identity Verification')

export default async function IdentityVerificationPage() {
  const [t, data, uiLocale] = await Promise.all([
    getTranslations(),
    getMyIdentityVerification(),
    getResolvedUiLocale(),
  ])

  return (
    <div className='space-y-6'>
      <div>
        <h1
          data-pw='identity-verification-page-heading'
          className='text-2xl font-bold'
        >
          {t('extracted.identityVerification.page.identityVerification_11c4c9be')}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.identityVerification.page.verifyYourIdentityWithAGovernment_0b76ee2c')}
        </p>
      </div>
      <IdentityVerificationContent
        verificationStatus={data.verification_status}
        verifiedBadgeVisible={data.verified_badge_visible}
        publicVerifiedNameDisplay={data.public_verified_name_display}
        verificationFee={formatVerificationFee(uiLocale)}
      />
    </div>
  )
}
