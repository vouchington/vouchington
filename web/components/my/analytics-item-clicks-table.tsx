'use client'

import { useMemo } from 'react'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { formatNumber } from '@ts-shared/utils/format'
import type { LandingPageItemClickStats, LandingPageItem } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'
import { PostContentText, type PostContentTextValue } from '@/components/posts/post-content-text'

interface Props {
  itemClicks: LandingPageItemClickStats[]
  items: LandingPageItem[]
}

export function AnalyticsItemClicksTable({ itemClicks, items }: Props) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const labelMap = useMemo(() => {
    const map = new Map<string, string | PostContentTextValue>()
    for (const item of items) {
      let label: string | null | undefined
      switch (item.type) {
        case 'profile_link': {
          label = item.profile_link.name || item.profile_link.url
          break
        }
        case 'review': {
          const title = item.review.title.trim()
          if (title) {
            map.set(item.id, {
              text: title,
              declared_language: item.review.declared_language,
              lingua_rs_detected_language: item.review.lingua_rs_detected_language,
            })
          }
          continue
        }
        case 'referral_link': {
          label = item.referral_link.label || item.referral_link.referral_program_name
          break
        }
        case 'topic_group': {
          label = item.topic.name
          break
        }
        case 'link': {
          label = item.label
          break
        }
      }
      if (label) map.set(item.id, label)
    }
    return map
  }, [items])

  return (
    <section>
      <h2 className='mb-4 text-lg font-semibold'>
        {t('extracted.my.analyticsItemClicksTable.clicksByItem_27c55e39')}
      </h2>
      <div className='overflow-hidden rounded-xl border border-border'>
        <table className='w-full text-sm'>
          <thead>
            <tr className='border-b border-border bg-muted/50'>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                {t('extracted.my.analyticsItemClicksTable.item_652bcc3a')}
              </th>
              <th className='px-4 py-3 text-left font-medium text-muted-foreground'>
                {t('extracted.my.analyticsItemClicksTable.type_baaddf70')}
              </th>
              <th className='px-4 py-3 text-right font-medium text-muted-foreground'>
                {t('extracted.my.analyticsItemClicksTable.clicks_921fc980')}
              </th>
            </tr>
          </thead>
          <tbody>
            {itemClicks.map(ic => {
              const label = labelMap.get(ic.item_id) ?? null
              return (
                <tr
                  key={ic.item_id}
                  className='border-b border-border last:border-0'
                >
                  <td className='px-4 py-3'>
                    {label && typeof label === 'object' ? (
                      <PostContentText
                        as='span'
                        content={label}
                      />
                    ) : (
                      label || (
                        <span className='font-mono text-xs text-muted-foreground'>
                          {ic.item_id.slice(0, 8)}…
                        </span>
                      )
                    )}
                  </td>
                  <td className='px-4 py-3'>
                    <span className='rounded-full bg-muted px-2 py-0.5 text-xs font-medium'>
                      {ic.item_type.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className='px-4 py-3 text-right font-semibold'>
                    {formatNumber(ic.click_count, uiLocale)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
