export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { Separator } from '@/components/ui/separator'

export const metadata: Metadata = createNoIndexMetadata('Identity')
import {
  getAuthSessionsServer,
  getMyEmailAddresses,
  getMyIdentity,
  getPasskeys,
  getTotpAuthenticators,
  getMfaStatus,
} from '@/lib/api/server'
import { ActiveSessionsManager } from '@/components/my/active-sessions-manager'
import { BlueskyConnection } from '@/components/my/bluesky-connection'
import { IdentityForm } from '@/components/my/identity-form'
import { EmailManager } from '@/components/my/email-manager'
import { MfaStatusBanner } from '@/components/my/mfa-status-banner'
import { OAuthConnectionsSection } from '@/components/my/oauth-connections-section'
import { PasskeyManager } from '@/components/my/passkey-manager'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { TotpManager } from '@/components/my/totp-manager'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function IdentityPage() {
  const t = await getTranslations()
  const [identityData, emailsData, passkeysData, totpData, mfaStatusData, sessionsData] =
    await Promise.all([
      getMyIdentity(),
      getMyEmailAddresses(),
      getPasskeys(),
      getTotpAuthenticators(),
      getMfaStatus(),
      getAuthSessionsServer(),
    ])
  const { identity } = identityData

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.identity.page.identity_999f23fc')}
        description={t('extracted.identity.page.manageYourUsernameAndProfileImage_4a2c91d7')}
      />

      <IdentityForm
        initialUsername={identity.username}
        initialProfileImageId={identity.profile_image_id}
        initialProfileImagePlacement={identity.profile_image_placement}
        initialUseDisplayNameFrom={identity.use_display_name_from}
        initialFacebookAccount={identity.facebook_account ?? null}
        hasOAuthAccount={
          !!(
            identity.facebook_account ||
            identity.apple_account ||
            identity.google_account ||
            identity.x_account ||
            identity.linkedin_account ||
            identity.microsoft_account ||
            identity.github_account
          )
        }
      />

      <Separator />

      <EmailManager initialData={emailsData} />

      <Separator />

      <MfaStatusBanner mfaStatus={mfaStatusData} />

      <Separator />

      <PasskeyManager
        initialData={passkeysData}
        mfaStatus={mfaStatusData}
      />

      <Separator />

      <TotpManager
        initialData={totpData}
        mfaStatus={mfaStatusData}
      />

      <Separator />

      <div id='social' />

      <OAuthConnectionsSection
        accounts={{
          facebook: identity.facebook_account ?? null,
          apple: identity.apple_account ?? null,
          google: identity.google_account ?? null,
          x: identity.x_account ?? null,
          linkedin: identity.linkedin_account ?? null,
          microsoft: identity.microsoft_account ?? null,
          github: identity.github_account ?? null,
        }}
      />

      <Separator />

      <BlueskyConnection initialAccount={identity.bluesky_account ?? null} />

      <Separator />

      <ActiveSessionsManager initialData={sessionsData} />
    </div>
  )
}
