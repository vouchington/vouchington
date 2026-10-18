'use client'

import { useTranslations } from '@/lib/i18n/use-translations'

export function ReportsTableHeader({ viewerTier }: { viewerTier: 'staff' | 'member' }) {
  const t = useTranslations()

  return (
    <thead className='bg-muted/50'>
      <tr>
        {viewerTier === 'staff' ? (
          <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
            {t('extracted.admin.reportsClient.select_2a78025d')}
          </th>
        ) : null}
        <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
          {t('extracted.admin.reportsClient.created_d70b9e24')}
        </th>
        {viewerTier === 'staff' ? (
          <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
            {t('extracted.admin.reportsClient.reporter_ed738fe8')}
          </th>
        ) : null}
        <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
          {t('extracted.admin.reportsClient.target_978354db')}
        </th>
        <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
          {t('extracted.admin.reportsClient.reason_f81ab834')}
        </th>
        <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
          {t('extracted.admin.reportsClient.status_920e413c')}
        </th>
        {viewerTier === 'staff' ? (
          <>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.admin.reportsClient.judgement_18d3597c')}
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.admin.reportsClient.note_d8da2c49')}
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.admin.reportsClient.resolvedBy_f266c7ec')}
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.admin.reportsClient.modNotes_4c351afd')}
            </th>
            <th className='px-6 py-3 text-left text-xs font-medium uppercase text-muted-foreground'>
              {t('extracted.admin.reportsClient.actions_ff8059dc')}
            </th>
          </>
        ) : null}
      </tr>
    </thead>
  )
}
