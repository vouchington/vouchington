import Link from 'next/link'
import { MessagesSquare, Link2, Tag, Shield, List } from 'lucide-react'
import type { getTranslations } from '@/lib/i18n/get-translations'

type Translate = Awaited<ReturnType<typeof getTranslations>>

export function SocialMechanics({ t }: { t: Translate }) {
  const mechanics = [
    {
      id: 'forum',
      icon: MessagesSquare,
      heading: t('extracted.home.socialMechanics.flexibleForum_ae210ac7'),
      body: t('extracted.home.socialMechanics.twitterStyleGlobalPostsAndReddit_0eb23ce6'),
      href: '/posts',
    },
    {
      id: 'referral-links',
      icon: Link2,
      heading: t('extracted.home.socialMechanics.referralLinksFromYourInnerCircle_2d728cbe'),
      body: t('extracted.home.socialMechanics.wePrioritizeReferralLinksFromYour_81f6b3c8'),
      href: '/referral-programs',
    },
    {
      id: 'topics',
      icon: Tag,
      heading: t('extracted.home.socialMechanics.topicsAsVotableTags_0f330362'),
      body: t('extracted.home.socialMechanics.topicsAreFirstClassModeratedEntities_bcb06cc1'),
      href: '/topics',
    },
    {
      id: 'labeling',
      icon: Shield,
      heading: t('extracted.home.socialMechanics.communityDrivenLabeling_f4867d28'),
      body: t('extracted.home.socialMechanics.hateAiGeneratedContentTagA_0fed44cc'),
      href: '/topics',
    },
    {
      id: 'lists',
      icon: List,
      heading: t('extracted.home.socialMechanics.communityCuratedLists_ce2a28bc'),
      body: t('extracted.home.socialMechanics.communitiesShareListsOfNewsSources_a4774339'),
      href: '/communities?has_list_items=true',
    },
  ]
  return (
    <div className='space-y-4 rounded-lg border bg-card p-6'>
      <h2 className='text-xl font-bold sm:text-2xl'>
        {t('extracted.home.socialMechanics.socialMechanics_96ab4e67')}
      </h2>
      <div className='grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]'>
        {mechanics.map(({ id, icon: Icon, heading, body, href }) => (
          <Link
            key={id}
            href={href}
            prefetch={false}
            className='block'
          >
            <div className='space-y-1.5 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md'>
              <div className='flex items-center gap-2'>
                <Icon className='h-5 w-5 shrink-0 text-primary' />
                <h3 className='font-semibold leading-snug'>{heading}</h3>
              </div>
              <p className='text-sm text-muted-foreground'>{body}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
