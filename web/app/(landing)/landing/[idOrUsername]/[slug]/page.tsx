import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PublicLandingPageView } from '@/components/landing-pages/public-landing-page'
import { getUserLandingPage } from '@/lib/api/server'
import { landingPageHref, landingPageNamedHref } from '@/lib/links/entity-href'
import { createNoIndexMetadata, createPageMetadata, createExcerpt } from '@/lib/seo/metadata'
import { buildLandingOgImageUrl, extractTopCategories } from '@/lib/seo/og-image-url'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ idOrUsername: string; slug: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { idOrUsername, slug } = await params
  const data = await getUserLandingPage(idOrUsername, slug)

  if (!data?.user.username) return createNoIndexMetadata()

  const path = data.landing_page.is_default
    ? landingPageHref(data.user.username)
    : landingPageNamedHref(data.user.username, data.landing_page.slug)
  const title = `${data.landing_page.title} (@${data.user.username})`
  const description =
    data.landing_page.subtitle ||
    createExcerpt(data.user.markdown || `Landing page for ${data.user.username}`)

  return createPageMetadata({
    title,
    description,
    path,
    imagePath: buildLandingOgImageUrl({
      displayName: data.user.display_name || data.user.username,
      username: data.user.username,
      topCategories: extractTopCategories(data),
      avatarImageId: data.user.profile_image_id,
    }),
  })
}

export default async function SlugLandingPage({ params }: PageProps) {
  const { idOrUsername, slug } = await params
  const data = await getUserLandingPage(idOrUsername, slug)

  if (!data?.user.username) {
    notFound()
  }

  if (data.landing_page.is_default) {
    redirect(landingPageHref(data.user.username))
  }

  const t = await getTranslations()

  return (
    <PublicLandingPageView
      data={data}
      canonicalPath={landingPageNamedHref(data.user.username, data.landing_page.slug)}
      t={t}
    />
  )
}
