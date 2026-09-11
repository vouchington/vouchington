import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { getTranslations } from '@/lib/i18n/get-translations'

type Translate = Awaited<ReturnType<typeof getTranslations>>

export function HomePageCta({ t }: { t: Translate }) {
  return (
    <div className='space-y-4 rounded-lg border bg-card p-6 text-center'>
      <h2 className='text-2xl font-bold'>
        {t('extracted.app.page.startYourCircleOfTrust_a6db7dc2')}
      </h2>
      <p className='mx-auto max-w-lg text-muted-foreground'>
        {t('extracted.app.page.joinPeopleWhoShareRealExperiences_2c516363')}
      </p>
      <Button asChild>
        <Link
          href='/login'
          prefetch={false}
        >
          {t('extracted.app.page.getStartedForFree_6b2179bf')}
        </Link>
      </Button>
    </div>
  )
}
