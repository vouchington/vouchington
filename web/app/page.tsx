import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { TrendingFeeds } from '@/components/home/trending-feeds'
import { TrendingFeedsStreaming } from '@/components/home/trending-feeds-streaming'
import { PlatformStatsBar } from '@/components/home/platform-stats-bar'
import { PlatformStatsBarStreaming } from '@/components/home/platform-stats-bar-streaming'
import { VouchaPillars } from '@/components/home/trust-explainer'
import { TrendingTopicsPreview } from '@/components/home/trending-topics-preview'
import { TrendingTopicsPreviewStreaming } from '@/components/home/trending-topics-preview-streaming'
import { renderAuthGatedStreaming } from '@/components/tags/render-auth-gated-streaming'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTrendingRssFeeds } from '@/lib/api/server/rss-feeds'
import { getPlatformStats } from '@/lib/api/server/platform-stats'
import { getTrendingTopics } from '@/lib/api/server/trending-topics'
import { createPageMetadata } from '@/lib/seo/metadata'
import { createOrganizationSchema, createWebSiteSchema } from '@/lib/seo/structured-data'
import { DiscoveryAsides } from '@/components/asides/discovery-asides'
import { PageWithAside } from '@/components/page-with-aside'
import { SocialMechanics } from '@/components/home/social-mechanics'
import { TopCommunities } from '@/components/home/top-communities'
import { TopReferralPrograms } from '@/components/home/top-referral-programs'
import { TopCommunitiesStreaming } from '@/components/home/top-communities-streaming'
import { TopReferralProgramsStreaming } from '@/components/home/top-referral-programs-streaming'
import { getTrendingCommunities } from '@/lib/api/server/trending-communities'
import { getTrendingReferralPrograms } from '@/lib/api/server/trending-referral-programs'
import { getTranslations } from '@/lib/i18n/get-translations'
import {
  projectPlatformStats,
  projectTopCommunities,
  projectTopReferralPrograms,
  projectTrendingFeeds,
  projectTrendingTopics,
} from '@/lib/view-models/homepage-view-models'
import { HomePageCta } from './home-page-cta'

export const dynamic = 'force-dynamic'

export const metadata = createPageMetadata({
  title: 'The Social Trust Network',
  path: '/',
})

function HomePageAside() {
  return (
    <Suspense fallback={null}>
      <DiscoveryAsides />
    </Suspense>
  )
}

export default async function Home() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (currentUser !== null) {
    redirect('/feed/news')
  }

  const trendingFeedsPromise = getTrendingRssFeeds({
    searchParams: { limit: 10, time_range: 'week' },
  }).then(projectTrendingFeeds)
  const platformStatsPromise = getPlatformStats().then(projectPlatformStats)
  const trendingTopicsPromise = getTrendingTopics({
    searchParams: { limit: 6, time_range: 'week' },
  }).then(projectTrendingTopics)
  const trendingCommunitiesPromise = getTrendingCommunities({
    searchParams: { limit: 5, sort: 'members' },
  }).then(projectTopCommunities)
  const trendingReferralProgramsPromise = getTrendingReferralPrograms({
    searchParams: { limit: 5 },
  }).then(projectTopReferralPrograms)
  const isAuthenticated = false

  const [
    trendingFeedsContent,
    platformStatsContent,
    trendingTopicsContent,
    topCommunitiesContent,
    topReferralProgramsContent,
  ] = await Promise.all([
    renderAuthGatedStreaming({
      isAuthenticated,
      dataPromise: trendingFeedsPromise.catch(() => null),
      renderLoggedOut: data =>
        data === null ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.app.page.unableToLoadTrendingFeeds_699d177f')}
          </p>
        ) : (
          <TrendingFeeds data={data} />
        ),
      renderStreaming: <TrendingFeedsStreaming dataPromise={trendingFeedsPromise} />,
      errorFallback: (
        <div className='text-sm text-destructive'>
          {t('extracted.app.page.errorLoadingTrendingFeeds_e62b279b')}
        </div>
      ),
    }),
    renderAuthGatedStreaming({
      isAuthenticated,
      dataPromise: platformStatsPromise.catch(() => null),
      renderLoggedOut: data => <PlatformStatsBar data={data} />,
      renderStreaming: <PlatformStatsBarStreaming dataPromise={platformStatsPromise} />,
      errorFallback: null,
    }),
    renderAuthGatedStreaming({
      isAuthenticated,
      dataPromise: trendingTopicsPromise.catch(() => null),
      renderLoggedOut: data => <TrendingTopicsPreview data={data} />,
      renderStreaming: <TrendingTopicsPreviewStreaming dataPromise={trendingTopicsPromise} />,
      errorFallback: null,
    }),
    renderAuthGatedStreaming({
      isAuthenticated,
      dataPromise: trendingCommunitiesPromise.catch(() => null),
      renderLoggedOut: data => <TopCommunities data={data} />,
      renderStreaming: <TopCommunitiesStreaming dataPromise={trendingCommunitiesPromise} />,
      errorFallback: null,
    }),
    renderAuthGatedStreaming({
      isAuthenticated,
      dataPromise: trendingReferralProgramsPromise.catch(() => null),
      renderLoggedOut: data => <TopReferralPrograms data={data} />,
      renderStreaming: (
        <TopReferralProgramsStreaming dataPromise={trendingReferralProgramsPromise} />
      ),
      errorFallback: null,
    }),
  ])

  return (
    <PageWithAside
      aside={HomePageAside}
      showFooter={false}
    >
      <div className='space-y-8 py-8'>
        <AnonymousStructuredDataScript data={createOrganizationSchema()} />
        <AnonymousStructuredDataScript data={createWebSiteSchema()} />
        <div className='space-y-4'>
          <h1
            data-pw='landing-hero-heading'
            className='text-4xl font-bold tracking-tight sm:text-5xl'
          >
            {t('extracted.app.page.theSocialTrustNetwork_998258fc')}
          </h1>
          <p
            data-pw='landing-hero-description'
            className='max-w-2xl text-lg text-muted-foreground'
          >
            {t('extracted.app.page.newsPodcastsVideosReviewsAndReferral_48f6dc67')}
          </p>
        </div>
        {platformStatsContent && <Suspense>{platformStatsContent}</Suspense>}
        <VouchaPillars t={t} />
        <SocialMechanics t={t} />
        <section>
          <h2 className='text-2xl font-bold'>{t('extracted.app.page.trendingTopics_e84e730e')}</h2>
          <p className='mt-1 text-muted-foreground'>
            {t('extracted.app.page.whatYourCommunityIsDiggingInto_b458bef1')}
          </p>
          <div className='mt-4'>
            <Suspense>{trendingTopicsContent}</Suspense>
          </div>
        </section>
        <section>
          <h2 className='text-2xl font-bold'>{t('extracted.app.page.trendingSources_4ef19a66')}</h2>
          <p className='mt-1 text-muted-foreground'>
            {t('extracted.app.page.theSourcesPeopleAreFollowingAnd_2887de61')}
          </p>
          <div className='mt-4'>{trendingFeedsContent}</div>
        </section>
        <section>
          <h2 className='text-2xl font-bold'>{t('extracted.app.page.topCommunities_064679ea')}</h2>
          <p className='mt-1 text-muted-foreground'>
            {t('extracted.app.page.largestCommunitiesOnVoucha_f7fbb8e1')}
          </p>
          <div className='mt-4'>
            <Suspense>{topCommunitiesContent}</Suspense>
          </div>
        </section>
        <section>
          <h2 className='text-2xl font-bold'>
            {t('extracted.app.page.topReferralPrograms_80b01b34')}
          </h2>
          <p className='mt-1 text-muted-foreground'>
            {t('extracted.app.page.popularReferralPrograms_28f4eb56')}
          </p>
          <div className='mt-4'>
            <Suspense>{topReferralProgramsContent}</Suspense>
          </div>
        </section>
        {!isAuthenticated && <HomePageCta t={t} />}
      </div>
    </PageWithAside>
  )
}
