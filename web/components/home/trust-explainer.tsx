import Link from 'next/link'
import { Rss, Star, Link2, Users, Bot } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { getTranslations } from '@/lib/i18n/get-translations'

type Translate = Awaited<ReturnType<typeof getTranslations>>

export function VouchaPillars({ t }: { t: Translate }) {
  const pillars = [
    {
      id: 'feed',
      icon: Rss,
      heading: t('extracted.home.trustExplainer.yourFeedCuratedByPeopleNot_80d886bd'),
      body: t('extracted.home.trustExplainer.followNewsSitesPodcastsAndYoutube_5fd1d066'),
      href: '/news',
      comingSoon: false,
    },
    {
      id: 'reviews',
      icon: Star,
      heading: t('extracted.home.trustExplainer.honestReviewsFromPeopleYouTrust_463a7a45'),
      body: t('extracted.home.trustExplainer.creditCardsGpusAiToolsAnd_16899529'),
      href: '/reviews',
      comingSoon: false,
    },
    {
      id: 'referral-links',
      icon: Link2,
      heading: t('extracted.home.trustExplainer.referralLinksFromFriendsNotStrangers_89dd15d0'),
      body: t('extracted.home.trustExplainer.whenYouRecommendSomethingYourFriends_70e23cdd'),
      href: '/referral-programs',
      comingSoon: false,
    },
    {
      id: 'communities',
      icon: Users,
      heading: t('extracted.home.trustExplainer.buildYourOwnVouchedCommunity_89c99faf'),
      body: t('extracted.home.trustExplainer.startASpaceAroundWhatYou_47e6eaf4'),
      href: '/communities',
      comingSoon: false,
    },
    {
      id: 'ai',
      icon: Bot,
      heading: t('extracted.home.trustExplainer.aiToConnectUs_22e9c7be'),
      body: t('extracted.home.trustExplainer.wePreferConnectingYouToYour_e9850c37'),
      href: null,
      comingSoon: true,
    },
  ]
  return (
    <div className='space-y-4 rounded-lg border bg-card p-6'>
      <h2 className='text-xl font-bold sm:text-2xl'>
        {t('extracted.home.trustExplainer.thePlatform_8a1b0a82')}
      </h2>
      <div className='grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]'>
        {pillars.map(({ id, icon: Icon, heading, body, href, comingSoon }) => {
          const card = (
            <div className='space-y-1.5'>
              <div className='flex items-center gap-2'>
                <Icon className='h-5 w-5 shrink-0 text-primary' />
                <h3 className='font-semibold leading-snug'>{heading}</h3>
              </div>
              {comingSoon && (
                <Badge
                  variant='secondary'
                  className='shrink-0 text-xs'
                >
                  {t('extracted.home.trustExplainer.comingSoon_4f7d6401')}
                </Badge>
              )}
              <p className='text-sm text-muted-foreground'>{body}</p>
            </div>
          )

          return href ? (
            <Link
              key={id}
              href={href}
              prefetch={false}
              className='block'
            >
              {card}
            </Link>
          ) : (
            <div key={id}>{card}</div>
          )
        })}
      </div>
    </div>
  )
}
