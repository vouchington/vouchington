'use client'

import { Label } from '@/components/ui/label'
import type { RelatedUrl } from './types'
import { useTranslations } from '@/lib/i18n/use-translations'

export function RelatedUrls({ urls }: { urls: RelatedUrl[] }) {
  const t = useTranslations()
  if (urls.length === 0) return null

  return (
    <div className='space-y-2'>
      <Label>{t('extracted.postForm.relatedUrls.relatedUrls_c4a80277')}</Label>
      <div className='flex flex-wrap gap-2'>
        {urls.map(u => (
          <span
            key={u.id}
            className='inline-flex items-center rounded-md border bg-muted px-2 py-1 text-xs'
          >
            {u.url}
          </span>
        ))}
      </div>
    </div>
  )
}
