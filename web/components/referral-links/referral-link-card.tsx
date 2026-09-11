'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { ExternalLink } from '@/components/ui/external-link'
import { Star } from 'lucide-react'
import { reviewHref } from '@/lib/links/entity-href'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { PrioritizedReferralLink, ReferralLinkUser } from '@/types/api-responses'

interface ReferralLinkCardProps {
  link: PrioritizedReferralLink
  user?: ReferralLinkUser
  variant?: 'default' | 'compact'
}

export function ReferralLinkCard({ link, user, variant = 'default' }: ReferralLinkCardProps) {
  const t = useTranslations()
  const isCompact = variant === 'compact'
  return (
    <div
      className={isCompact ? 'py-1' : 'flex items-center justify-between rounded-md border p-4'}
      data-pw='referral-link-card'
    >
      <div className='min-w-0 flex-1'>
        <ExternalLink
          href={link.url}
          className='block truncate text-sm font-medium hover:underline'
          ugc
        >
          {link.label ?? link.url}
        </ExternalLink>
        {link.is_official ? (
          <Badge
            variant='secondary'
            className='text-xs'
            data-pw='official-voucha-badge'
          >
            {t('extracted.referralLinks.referralLinkCard.officialVoucha_a2d311b4')}
          </Badge>
        ) : user ? (
          <p className='text-xs text-muted-foreground'>
            {t('extracted.referralLinks.referralLinkCard.byName_77567cd0', {
              name: user.display_name ?? user.username,
            })}
          </p>
        ) : null}
        {link.review_post_id && (
          <Link
            href={reviewHref({ id: link.review_post_id, slug: link.review_post_slug })}
            prefetch={false}
            className='flex items-center gap-1 text-xs text-primary hover:underline'
          >
            <Star
              aria-hidden='true'
              focusable='false'
              className='h-3 w-3 fill-yellow-400 text-yellow-400'
            />
            {link.review_avg_rating != null
              ? t('extracted.referralLinks.referralLinkCard.rating5Review_97e37ee8', {
                  rating: link.review_avg_rating.toFixed(1),
                })
              : t('extracted.referralLinks.referralLinkCard.viewReview_9211bef7')}
          </Link>
        )}
      </div>
      {!isCompact && (
        <ExternalLink
          href={link.url}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          ugc
        >
          {t('extracted.referralLinks.referralLinkCard.open_ed077f3d')}
        </ExternalLink>
      )}
    </div>
  )
}
