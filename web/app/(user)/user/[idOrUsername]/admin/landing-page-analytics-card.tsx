import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { LandingPage } from '@/types/landing-pages'
import { getTranslations } from '@/lib/i18n/get-translations'

interface LandingPageAnalyticsCardProps {
  landingPages: LandingPage[]
}

export async function LandingPageAnalyticsCard({ landingPages }: LandingPageAnalyticsCardProps) {
  const t = await getTranslations()
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('extracted.admin.landingPageAnalyticsCard.landingPageAnalytics_3114eb92')}
        </CardTitle>
        <CardDescription>
          {t('extracted.admin.landingPageAnalyticsCard.reviewTheTargetUserSLanding_3401ee56')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {landingPages.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.admin.landingPageAnalyticsCard.noLandingPagesFoundForThis_586bfdb4')}
          </p>
        ) : (
          <ul className='space-y-3'>
            {landingPages.map(page => (
              <li
                key={page.id}
                data-pw='admin-user-landing-page'
                className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
              >
                <div className='min-w-0'>
                  <p className='font-medium'>{page.title}</p>
                  <p className='text-sm text-muted-foreground'>
                    {page.slug}
                    {page.is_default
                      ? t('extracted.admin.landingPageAnalyticsCard.default_206c3778')
                      : ''}
                  </p>
                </div>
                <Button
                  asChild
                  variant='outline'
                  size='sm'
                >
                  <Link
                    href={`/admin/landing-pages/${page.id}/analytics`}
                    prefetch={false}
                    data-pw='admin-user-landing-page-analytics-link'
                    aria-label={t(
                      'extracted.admin.landingPageAnalyticsCard.viewAnalyticsForTitle_f55965f9',
                      { title: page.title },
                    )}
                  >
                    <BarChart3 data-icon='inline-start' />
                    {t('extracted.admin.landingPageAnalyticsCard.viewAnalytics_1acacc4d')}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
