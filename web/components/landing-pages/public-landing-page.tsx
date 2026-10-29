import Link from 'next/link'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { buildPlacementImagePath } from '@/lib/utils/image-url'
import { createProfilePageSchema } from '@/lib/seo/profile-page-schema'
import { LandingPageTracker } from './landing-page-tracker'
import type { PublicLandingPage } from '@/types/landing-pages'
import { PublicLandingPageHeader } from './public-landing-page-header'
import { PublicLandingPageItems } from './public-landing-page-items'
import type { getTranslations } from '@/lib/i18n/get-translations'
import { getUserLabel } from '@/lib/users/user-helpers'

type Translate = Awaited<ReturnType<typeof getTranslations>>

interface Props {
  data: PublicLandingPage
  canonicalPath: string
  t: Translate
}

export function PublicLandingPageView({ data, canonicalPath, t }: Props) {
  const displayName = getUserLabel(
    { display_account: { name: data.user.display_name }, username: data.user.username },
    t('shared.user.deletedUser'),
  )
  const profileImagePath = buildPlacementImagePath(data.user.profile_image_placement)

  return (
    <>
      <AnonymousStructuredDataScript
        data={createProfilePageSchema({
          username: data.user.username,
          displayName,
          path: canonicalPath,
          identifier: data.user.id,
          imagePath: profileImagePath ?? null,
          dateCreated: data.landing_page.created_at,
        })}
      />
      <div className='mx-auto max-w-lg space-y-4 px-4 py-8'>
        <PublicLandingPageHeader
          canonicalHref={canonicalPath}
          displayName={displayName}
          profileImagePath={profileImagePath ?? null}
          subtitle={data.landing_page.subtitle}
          title={data.landing_page.title}
          userMarkdown={data.user.markdown}
          detectedLanguage={data.user.lingua_rs_detected_language}
          username={data.user.username}
        />

        <LandingPageTracker landingPageId={data.landing_page.id}>
          <PublicLandingPageItems
            items={data.landing_page.items}
            t={t}
          />
        </LandingPageTracker>

        <div className='py-4 text-center'>
          <Link
            href='/login'
            prefetch={false}
            data-pw='landing-page-voucha-cta'
            className='text-xs text-muted-foreground transition-colors hover:text-foreground'
          >
            {t('extracted.landingPages.publicLandingPage.createYourFreePageOn_087517fb')}{' '}
            <span className='font-semibold'>Voucha</span>
          </Link>
        </div>
      </div>
    </>
  )
}
