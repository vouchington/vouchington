'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ManageSourceRssFeed } from './manage-source-model'
import { useTranslations } from '@/lib/i18n/use-translations'

export function SourceSection({
  onSubmit,
  rssFeed,
  saving,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  rssFeed: ManageSourceRssFeed | null
  saving: boolean
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        className='mb-4 text-xl font-semibold text-foreground'
        // oxlint-disable-next-line no-mistakes/playwright-literals -- conditional heading based on state
        data-pw={rssFeed ? 'update-source-heading' : 'source-heading'}
      >
        {rssFeed
          ? t('extracted.manageSource.sourceSection.updateSource_d413c6b0')
          : t('extracted.manageSource.sourceSection.source_0e570ca6')}
      </h2>
      {rssFeed ? (
        <form
          key={rssFeed.id}
          onSubmit={onSubmit}
          className='space-y-4'
        >
          <div>
            <Label htmlFor='title'>
              {t('extracted.manageSource.sourceSection.title_7e8cd205')}
            </Label>
            <Input
              type='text'
              id='title'
              name='title'
              data-pw='source-title-input'
              defaultValue={rssFeed.title ?? ''}
              placeholder={t(
                'extracted.manageSource.sourceSection.autoDetectedFromFeedIfLeft_ec122285',
              )}
              className='mt-1'
            />
            <p className='mt-1 text-xs text-muted-foreground'>
              {t('extracted.manageSource.sourceSection.optionalLeaveBlankToAutoDetect_dffc3fb5')}
            </p>
          </div>
          <div>
            <Label htmlFor='rss_feed_url'>
              {t('extracted.manageSource.sourceSection.sourceUrl_1adf66b3')}
            </Label>
            <Input
              type='url'
              id='rss_feed_url'
              name='rss_feed_url'
              data-pw='source-url-input'
              defaultValue={rssFeed.rss_feed_url?.url ?? ''}
              required
              placeholder={t(
                'extracted.manageSource.sourceSection.httpsExampleComFeedXml_7a775db7',
              )}
              className='mt-1'
            />
          </div>
          <Button
            type='submit'
            data-pw='update-source-submit'
            loading={saving}
            disabled={saving}
          >
            {saving
              ? t('extracted.manageSource.sourceSection.saving_dc85af8f')
              : t('extracted.manageSource.sourceSection.updateSource_d413c6b0')}
          </Button>
        </form>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.manageSource.sourceSection.noRssFeedLinkedToThis_4bd6faed')}{' '}
          <Link
            href='/sources'
            prefetch={false}
            className='text-primary underline'
          >
            /sources
          </Link>
          .
        </p>
      )}
    </section>
  )
}
