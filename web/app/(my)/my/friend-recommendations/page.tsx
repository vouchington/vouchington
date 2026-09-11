export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import Link from 'next/link'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { FriendRecommendationsList } from '@/components/my/friend-recommendations-list'
import { getMyFriendRecommendations } from '@/lib/api/server'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Find Friends')

export default async function FriendRecommendationsPage() {
  const [t] = await Promise.all([getTranslations(), requireCurrentUser()])
  const initialData = await getMyFriendRecommendations()

  return (
    <div className='space-y-6'>
      <p
        className='text-sm text-muted-foreground'
        data-pw='friend-recommendations-description'
      >
        {t('extracted.friendRecommendations.page.peopleYouMayKnowFromFacebook_dc84e1ad')}{' '}
        <Link
          href='/my/identity#social'
          className='underline'
          data-pw='friend-recommendations-identity-link'
        >
          {t('extracted.friendRecommendations.page.connectYourAccounts_0e7cf4c1')}
        </Link>{' '}
        {t('extracted.friendRecommendations.page.toGetStarted_305f69df')}
      </p>
      <FriendRecommendationsList initialData={initialData} />
    </div>
  )
}
