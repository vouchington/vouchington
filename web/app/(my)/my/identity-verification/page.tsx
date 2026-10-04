export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getMyIdentityVerification } from '@/lib/api/server/my'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { IdentityVerificationContent } from './identity-verification-content'
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
      <SettingsPageHeader
        title={t('extracted.identityVerification.page.identityVerification_11c4c9be')}
        description={t(
          'extracted.identityVerification.page.verifyYourIdentityWithAGovernment_0b76ee2c',
        )}
      />
      <IdentityVerificationContent
        verificationStatus={data.verification_status}
        verifiedBadgeVisible={data.is_verified_badge_visible}
        publicVerifiedNameDisplay={data.public_verified_name_display}
        verificationFee={formatVerificationFee(uiLocale)}
      />
    </div>
  )
}
