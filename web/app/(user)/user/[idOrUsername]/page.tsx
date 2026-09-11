import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { MARKDOWN_CONTENT_FEATURES_RICH } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { getUserProfile, GET_USER_PROFILE_WITH_BIO } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createUserPathname } from '@/lib/links/entity-href'
import { createNoIndexMetadata, createPageMetadata } from '@/lib/seo/metadata'
import { createProfilePageSchema } from '@/lib/seo/profile-page-schema'
import { resolveProfileLinkUrls } from '@/lib/users/profile-link-href'
import { getDisplayName, isProfileOwner } from '@/lib/users/user-helpers'
import { getTranslations } from '@/lib/i18n/get-translations'
import { buildImagePath } from '@/lib/utils/image-url'

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { idOrUsername } = await params

  const profileData = await getUserProfile(idOrUsername, GET_USER_PROFILE_WITH_BIO)
  if (!profileData) {
    return createNoIndexMetadata()
  }
  const user = profileData.user

  const displayName = getDisplayName(user)
  const hasDistinctDisplayName =
    user.username && user.display_account?.name && user.display_account.name !== user.username
  const title = hasDistinctDisplayName ? `${displayName} (@${user.username})` : displayName

  return createPageMetadata({
    title,
    description: `Profile of ${displayName}`,
    path: createUserPathname(user),
    imagePath: buildImagePath(user.profile_image_id),
    ...(user.username ? { rssUrl: `/rss/posts?user=${encodeURIComponent(user.username)}` } : {}),
  })
}

export default async function UserProfilePage({ params }: PageProps) {
  const t = await getTranslations()
  const { idOrUsername } = await params

  const [profileData, currentUser] = await Promise.all([
    getUserProfile(idOrUsername, GET_USER_PROFILE_WITH_BIO),
    getCurrentUser(),
  ])

  if (!profileData) {
    notFound()
  }
  const user = profileData.user

  const canonicalPath = createUserPathname(user)
  const profileImagePath = buildImagePath(user.profile_image_id)
  const sameAs = resolveProfileLinkUrls(profileData.profile_links ?? [])

  const isOwner = isProfileOwner(currentUser, user)

  return (
    <>
      <AnonymousStructuredDataScript
        data={createProfilePageSchema({
          username: user.username ?? user.id,
          displayName: getDisplayName(user),
          path: canonicalPath,
          identifier: user.id,
          imagePath: profileImagePath,
          sameAs,
        })}
      />
      {profileData.user_bio_html ? (
        <MarkdownContent
          html={profileData.user_bio_html}
          features={MARKDOWN_CONTENT_FEATURES_RICH}
        />
      ) : isOwner ? (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.idorusername.page.addAn_0452bee2')}{' '}
          <Link
            href='/my/profile'
            prefetch={false}
            className='underline underline-offset-4 hover:text-foreground'
          >
            {t('extracted.idorusername.page.aboutMe_0bf7f38a')}
          </Link>{' '}
          {t('extracted.idorusername.page.toYourProfile_97b02f09')}
        </p>
      ) : null}
    </>
  )
}
