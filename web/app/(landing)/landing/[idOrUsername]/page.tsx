import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicLandingPageView } from '@/components/landing-pages/public-landing-page'
import { getUserLandingPage } from '@/lib/api/server'
import { landingPageHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata, createPageMetadata, createExcerpt } from '@/lib/seo/metadata'
import { buildLandingOgImageUrl, extractTopCategories } from '@/lib/seo/og-image-url'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { idOrUsername } = await params
  const data = await getUserLandingPage(idOrUsername)

  if (!data?.user.username) return createNoIndexMetadata()

  const title = `${data.landing_page.title} (@${data.user.username})`
  const description =
    data.landing_page.subtitle ||
    createExcerpt(data.user.markdown || `Landing page for ${data.user.username}`)

  return createPageMetadata({
    title,
    description,
    path: landingPageHref(data.user.username),
    imagePath: buildLandingOgImageUrl({
      displayName: data.user.display_name || data.user.username,
      username: data.user.username,
      topCategories: extractTopCategories(data),
      avatarImageId: data.user.profile_image_id,
    }),
  })
}

export default async function DefaultLandingPage({ params }: PageProps) {
  const { idOrUsername } = await params
  const data = await getUserLandingPage(idOrUsername)

  if (!data?.user.username) {
    notFound()
  }

  const t = await getTranslations()

  return (
    <PublicLandingPageView
      data={data}
      canonicalPath={landingPageHref(data.user.username)}
      t={t}
    />
  )
}
