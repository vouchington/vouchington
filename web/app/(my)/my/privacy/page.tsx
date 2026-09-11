export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PrivacyForm } from '@/components/my/privacy-form'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createNoIndexMetadata('Privacy Settings')

export default async function PrivacyPage() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.privacy.page.privacy_54a57c31')}
        description={t('extracted.privacy.page.controlWhoCanSeeYourActivity_50daae77')}
      />
      <PrivacyForm
        initialUser={{
          id: currentUser.id,
          cards_visibility: currentUser.cards_visibility,
          rewards_program_statuses_visibility: currentUser.rewards_program_statuses_visibility,
          spending_categories_visibility: currentUser.spending_categories_visibility,
          follows_visibility: currentUser.follows_visibility,
          topic_follows_visibility: currentUser.topic_follows_visibility,
          rss_feed_follows_visibility: currentUser.rss_feed_follows_visibility,
          community_memberships_visibility: currentUser.community_memberships_visibility,
          followers_visibility: currentUser.followers_visibility,
          likes_visibility: currentUser.likes_visibility,
          direct_messages_audience: currentUser.direct_messages_audience,
          default_post_broadcast: currentUser.default_post_broadcast,
          default_post_privacy: currentUser.default_post_privacy,
          processing_restricted_at: currentUser.processing_restricted_at,
          third_party_marketing: currentUser.third_party_marketing,
        }}
      />
    </div>
  )
}
