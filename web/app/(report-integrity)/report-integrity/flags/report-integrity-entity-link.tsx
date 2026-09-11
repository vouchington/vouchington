'use client'

import Link from 'next/link'
import { createUserPathname } from '@/lib/links/entity-href'
import type { ReportIntegrityFlag } from '@/types/report-integrity'
import { useTranslations } from '@/lib/i18n/use-translations'

export function EntityLink({ flag }: { flag: ReportIntegrityFlag }) {
  // post_id covers both posts and comments; the correct route depends on post_type
  // and slug, which are not in the flag record. Show the ID so admins can locate
  // the content via the global reports queue (/reports?entity_type=post&…).
  const t = useTranslations()
  if (flag.post_id) {
    return (
      <span title={flag.post_id}>
        {t('extracted.flags.reportIntegrityEntityLink.postCommentId_dca17fa3', {
          id: flag.post_id.slice(0, 8),
        })}
      </span>
    )
  }
  if (flag.reported_user_id) {
    return (
      <Link
        href={createUserPathname(flag.reported_user_id, '/admin')}
        className='hover:underline'
      >
        {t('extracted.flags.reportIntegrityEntityLink.userId_884a08f2', {
          id: flag.reported_user_id.slice(0, 8),
        })}
      </Link>
    )
  }
  if (flag.hostname_id)
    return (
      <span>
        {t('extracted.flags.reportIntegrityEntityLink.hostnameId_01111c78', {
          id: flag.hostname_id.slice(0, 8),
        })}
      </span>
    )
  if (flag.rss_feed_item_id)
    return (
      <span>
        {t('extracted.flags.reportIntegrityEntityLink.rssItemId_ef2f011c', {
          id: flag.rss_feed_item_id.slice(0, 8),
        })}
      </span>
    )
  return <span>{t('extracted.flags.reportIntegrityEntityLink.unknown_b764cdc0')}</span>
}
