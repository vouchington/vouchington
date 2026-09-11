'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function TagLimitCta() {
  const t = useTranslations()
  return (
    <Card
      className='p-0'
      data-pw='tag-limit-cta'
    >
      <CardHeader>
        <div className='flex items-center gap-2'>
          <Lock className='h-4 w-4 text-muted-foreground' />
          <CardTitle className='text-base'>
            {t('extracted.tags.tagLimitCta.youVeReachedYourTagLimit_0c742cd1')}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.tags.tagLimitCta.upgradeYourMembershipToAddMore_b1f67589')}
        </p>
        <Button
          asChild
          data-pw='tag-limit-cta-upgrade'
        >
          <Link
            href='/plans'
            prefetch={false}
          >
            {t('extracted.tags.tagLimitCta.viewPlans_a72e2bd3')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
