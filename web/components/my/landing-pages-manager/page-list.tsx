'use client'

import { Button } from '@/components/ui/button'
import type { LandingPage, LandingPageWithItems } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'

export function PageList({
  pages,
  selectedPage,
  username,
  onSelectPage,
}: {
  pages: LandingPage[]
  selectedPage: LandingPageWithItems | null
  username: string
  onSelectPage: (pageId: string) => void
}) {
  const t = useTranslations()
  return (
    <div className='space-y-2 rounded-lg border p-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.landingPagesManager.pageList.yourPages_a14fbf2a')}
      </h2>
      {pages.map(page => (
        <Button
          key={page.id}
          type='button'
          variant='ghost'
          onClick={() => onSelectPage(page.id)}
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`landing-pages-settings-page-button-${page.slug}`}
          className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
            selectedPage?.id === page.id ? 'border-primary bg-accent' : 'border-border'
          }`}
        >
          <div className='flex items-center justify-between gap-2'>
            <span>{page.title}</span>
            {page.is_default ? (
              <span className='text-xs text-muted-foreground'>
                {t('extracted.landingPagesManager.pageList.default_21b111cb')}
              </span>
            ) : null}
          </div>
          <p className='text-xs text-muted-foreground'>
            /@{username}
            {page.is_default ? '' : `/${page.slug}`}
          </p>
        </Button>
      ))}
    </div>
  )
}
