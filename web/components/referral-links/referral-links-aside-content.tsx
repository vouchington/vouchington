'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { topicIdOrSlug } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ReferralLinkCard } from './referral-link-card'
import type { PrioritizedReferralLinksResponse } from '@/types/api-responses'

interface ReferralLinksAsideContentProps {
  topicId: string
  topicSlug?: string | null
  topicType: string
  response: PrioritizedReferralLinksResponse
}

export function ReferralLinksAsideContent({
  topicId,
  topicSlug,
  topicType,
  response,
}: ReferralLinksAsideContentProps) {
  const t = useTranslations()
  const topLinks = response.links.slice(0, 5)
  if (topLinks.length === 0) return null

  return (
    <Card className='p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <div>
          <h3
            className='text-sm font-semibold'
            data-pw='referral-links-aside-heading'
          >
            {t('extracted.referralLinks.referralLinksAsideContent.referralLinks_4348d2ad')}
          </h3>
          <p className='text-xs text-muted-foreground'>
            {t(
              'extracted.referralLinks.referralLinksAsideContent.shareYourLinkToEarnWhen_234915ae',
            )}
          </p>
        </div>
        <Button
          asChild
          variant='ghost'
          size='sm'
        >
          <Link
            prefetch={false}
            href={`/${topicType}/${topicIdOrSlug({ id: topicId, slug: topicSlug })}/referral-links`}
            data-pw='referral-links-aside-view-all'
          >
            {t('extracted.referralLinks.referralLinksAsideContent.viewAll_ff5573a6')}
          </Link>
        </Button>
      </div>
      <ul className='space-y-2'>
        {topLinks.map(link => {
          const user = link.user_id ? response.users[link.user_id] : undefined
          return (
            <li key={link.id}>
              <ReferralLinkCard
                link={link}
                user={user}
                variant='compact'
              />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
