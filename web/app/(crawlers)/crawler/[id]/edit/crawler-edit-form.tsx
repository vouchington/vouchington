'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import onError, { onSuccess } from '@/lib/on-error'
import { createCrawlerPathname } from '@/lib/links/entity-href'
import { updateCrawler } from '@/lib/api/client/admin'
import { buildCrawlerUpdates } from './crawler-edit-updates'
import { CrawlerRemovalFields } from './crawler-removal-fields'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface Crawler {
  id: string
  description: string
  crawler_type: string
  priority: number
  css_selectors_to_remove: string[]
  link_text_content_to_remove: string[]
  link_hrefs_to_remove: string[]
}

interface CrawlerEditFormProps {
  crawler: Crawler
  crawlerId: string
}

export function CrawlerEditForm({ crawler, crawlerId }: CrawlerEditFormProps) {
  const t = useTranslations()
  const { push } = useRouter()
  const mounted = useDidHydrate()
  // eslint-disable-next-line react-doctor/no-derived-useState -- intentional initial value; crawlerType diverges after user edits
  const [crawlerType, setCrawlerType] = useState(crawler.crawler_type)
  const [saving, setSaving] = useState(false)
  const handleCrawlerTypeChange = setCrawlerType

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)

    try {
      await updateCrawler(
        crawlerId,
        buildCrawlerUpdates(new FormData(e.currentTarget), crawlerType),
      )

      onSuccess(t('extracted.edit.crawlerEditForm.crawlerUpdated_26524a0e'))
      push(createCrawlerPathname({ id: crawlerId }))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.edit.crawlerEditForm.failedToUpdateCrawler_f838359a'),
        tags: { form: 'admin-crawler-edit' },
      })
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-hydrated={mounted ? 'true' : 'false'}
      className='max-w-2xl space-y-6'
    >
      <CrawlerBasicFields
        crawler={crawler}
        crawlerType={crawlerType}
        onCrawlerTypeChange={handleCrawlerTypeChange}
      />
      <CrawlerRemovalFields crawler={crawler} />
      <div className='flex gap-4'>
        <Button
          type='submit'
          data-pw='crawler-save-button'
          loading={saving}
          disabled={!mounted || saving}
        >
          {saving
            ? t('extracted.edit.crawlerEditForm.saving_dc85af8f')
            : t('extracted.edit.crawlerEditForm.saveChanges_35322b5b')}
        </Button>
        <Link
          prefetch={false}
          href={createCrawlerPathname({ id: crawlerId })}
          data-pw='crawler-cancel-link'
          className='rounded-md bg-secondary px-4 py-2 text-secondary-foreground hover:bg-secondary/80'
        >
          {t('extracted.edit.crawlerEditForm.cancel_19766ed6')}
        </Link>
      </div>
    </form>
  )
}

function CrawlerBasicFields({
  crawler,
  crawlerType,
  onCrawlerTypeChange,
}: {
  crawler: Crawler
  crawlerType: string
  onCrawlerTypeChange: (crawlerType: string) => void
}) {
  const t = useTranslations()
  return (
    <>
      <div>
        <Label htmlFor='description'>
          {t('extracted.edit.crawlerEditForm.description_526e0087')}
        </Label>
        <Textarea
          id='description'
          name='description'
          data-pw='crawler-description-input'
          rows={3}
          defaultValue={crawler.description}
          placeholder={t('extracted.edit.crawlerEditForm.describeWhenThisCrawlerShouldBe_643562b2')}
          className='mt-1'
        />
      </div>
      <div>
        <Label htmlFor='crawler_type'>
          {t('extracted.edit.crawlerEditForm.crawlerType_87b41c0e')}
        </Label>
        <Select
          value={crawlerType}
          onValueChange={onCrawlerTypeChange}
        >
          <SelectTrigger
            id='crawler_type'
            data-pw='crawler-type-select'
            className='mt-1'
          >
            <SelectValue
              placeholder={t('extracted.edit.crawlerEditForm.selectCrawlerType_f011c30b')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='fetch'>
              {t('extracted.edit.crawlerEditForm.fetch_cd7d61bf')}
            </SelectItem>
            <SelectItem value='automation'>
              {t('extracted.edit.crawlerEditForm.automation_d909750b')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor='priority'>{t('extracted.edit.crawlerEditForm.priority_d60dbba0')}</Label>
        <Input
          type='number'
          id='priority'
          name='priority'
          data-pw='crawler-priority-input'
          defaultValue={crawler.priority}
          placeholder={t('extracted.edit.crawlerEditForm.0_5feceb66')}
          className='mt-1'
        />
      </div>
    </>
  )
}
