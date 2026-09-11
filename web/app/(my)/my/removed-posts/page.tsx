import type { Metadata } from 'next'
import { getMyRemovedPosts } from '@/lib/api/server'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { MyRemovedPostsClient } from './my-removed-posts-client'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Removed Posts')

export default async function MyRemovedPostsPage() {
  const [t] = await Promise.all([getTranslations(), requireCurrentUser()])
  const data = await getMyRemovedPosts()

  return (
    <div
      className='space-y-6'
      data-pw='my-removed-posts-page'
    >
      <SettingsPageHeader
        title={t('extracted.removedPosts.page.myRemovedPosts_37fc0c8c')}
        description={t(
          'extracted.removedPosts.page.postsRemovedFromCommunitiesByModerators_708192a3',
        )}
      />
      <MyRemovedPostsClient initialData={data} />
    </div>
  )
}
