'use client'

import { UserAvatar } from '@/components/shared/user-avatar'
import { UserLink } from '@/components/users/user-link'
import { ExternalLink } from '@/components/ui/external-link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { topicHref } from '@/lib/links/entity-href'
import Link from 'next/link'
import type { ReferralLinkFeedItem, ReferralLinkFeedUser } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

type ReferralLinkFeedCardProps = {
  item: ReferralLinkFeedItem
  user: ReferralLinkFeedUser | undefined
}

export function ReferralLinkFeedCard({ item, user }: ReferralLinkFeedCardProps) {
  const t = useTranslations()
  const programHref = topicHref({
    topic_type: 'referral_program',
    id: item.referral_program_id,
    slug: item.referral_program_slug,
  })
  return (
    <Card data-pw='referral-link-feed-card'>
      <CardContent className='pb-4 pt-4'>
        <div className='flex flex-col gap-3'>
          {user && (
            <div className='flex items-center gap-2'>
              <UserAvatar
                profileImageId={user.profile_image_id}
                username={user.username}
                size='sm'
              />
              <UserLink user={user} />
            </div>
          )}
          <div className='flex flex-col gap-1'>
            <Link
              href={programHref}
              className='font-medium hover:underline'
              prefetch={false}
            >
              {item.referral_program_name}
            </Link>
            {item.label && <p className='text-sm text-muted-foreground'>{item.label}</p>}
          </div>
          <div className='flex items-center gap-2'>
            <span className='flex-1 truncate text-sm text-muted-foreground'>{item.url}</span>
            <Button
              asChild
              variant='outline'
              size='sm'
            >
              <ExternalLink
                href={item.url}
                ugc
              >
                {t('extracted.feed.referralLinkFeedCard.open_ed077f3d')}
              </ExternalLink>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
