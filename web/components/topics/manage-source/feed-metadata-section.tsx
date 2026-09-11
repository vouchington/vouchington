'use client'

import type { ManageSourceRssFeed } from './manage-source-model'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FeedMetadataSection({ rssFeed }: { rssFeed: ManageSourceRssFeed }) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('extracted.manageSource.feedMetadataSection.metadata_9eddf573')}
      </h2>
      <dl className='space-y-2 text-sm'>
        <MetadataRow label={t('extracted.manageSource.feedMetadataSection.status_755c8b2a')}>
          <span
            data-pw='feed-status'
            className={
              rssFeed.is_enabled
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-destructive dark:text-destructive'
            }
          >
            {rssFeed.is_enabled
              ? t('extracted.manageSource.feedMetadataSection.enabled_92c1cdfd')
              : t('extracted.manageSource.feedMetadataSection.disabled_75081b59')}
          </span>
        </MetadataRow>
        <MetadataRow
          label={t('extracted.manageSource.feedMetadataSection.discoverability_23884030')}
        >
          <span data-pw='feed-discoverability'>
            {rssFeed.is_discoverable
              ? t('extracted.manageSource.feedMetadataSection.discoverable_a69e9ccf')
              : t('extracted.manageSource.feedMetadataSection.hiddenFromDiscovery_cf5e02e4')}
          </span>
        </MetadataRow>
        <MetadataRow label={t('extracted.manageSource.feedMetadataSection.homepage_4c9f0e51')}>
          {rssFeed.home_page_url?.url ??
            t('extracted.manageSource.feedMetadataSection.linkTheTopicToAPrimary_0b55d2d2')}
        </MetadataRow>
        <MetadataRow label={t('extracted.manageSource.feedMetadataSection.lastFetched_8793b931')}>
          {rssFeed.last_fetched_at
            ? new Date(rssFeed.last_fetched_at).toLocaleString()
            : t('extracted.manageSource.feedMetadataSection.never_6300ef80')}
        </MetadataRow>
        <MetadataRow label={t('extracted.manageSource.feedMetadataSection.etag_65c09e9a')}>
          <span className='font-mono'>
            {rssFeed.etag ?? t('extracted.manageSource.feedMetadataSection.none_dc937b59')}
          </span>
        </MetadataRow>
        <MetadataRow label={t('extracted.manageSource.feedMetadataSection.lastModified_7557e6ae')}>
          {rssFeed.last_modified_at
            ? new Date(rssFeed.last_modified_at).toLocaleString()
            : t('extracted.manageSource.feedMetadataSection.none_dc937b59')}
        </MetadataRow>
      </dl>
    </section>
  )
}

function MetadataRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className='flex gap-2'>
      <dt className='w-40 font-medium text-muted-foreground'>{label}</dt>
      <dd className='text-foreground'>{children}</dd>
    </div>
  )
}
