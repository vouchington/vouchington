'use client'

/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Field IDs are passed through this shared renderer from literal call sites; ast-grep still bans inline calls in data-pw. */
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Crawler } from './crawler-edit-form'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CrawlerRemovalFields({ crawler }: { crawler: Crawler }) {
  const t = useTranslations()
  return (
    <>
      <CrawlerListField
        id='css_selectors_to_remove'
        dataPw='crawler-css-selectors-to-remove-input'
        label={t('extracted.edit.crawlerRemovalFields.cssSelectorsToRemoveOnePer_46e20d4b')}
        value={crawler.css_selectors_to_remove}
        placeholder={t('extracted.edit.crawlerRemovalFields.adBannerNewsletterSignup_b35ceb08')}
        className='mt-1 font-mono'
      />
      <CrawlerListField
        id='link_text_content_to_remove'
        dataPw='crawler-link-text-content-to-remove-input'
        label={t('extracted.edit.crawlerRemovalFields.linkTextContentToRemoveOne_a8525d64')}
        value={crawler.link_text_content_to_remove}
        placeholder={t('extracted.edit.crawlerRemovalFields.subscribeAdvertisement_9d0d679f')}
        className='mt-1'
      />
      <CrawlerListField
        id='link_hrefs_to_remove'
        dataPw='crawler-link-hrefs-to-remove-input'
        label={t('extracted.edit.crawlerRemovalFields.linkHrefsToRemoveOnePer_d15f0816')}
        value={crawler.link_hrefs_to_remove}
        placeholder={t('extracted.edit.crawlerRemovalFields.subscribeNewsletter_e731a5e6')}
        className='mt-1 font-mono'
      />
    </>
  )
}

function CrawlerListField({
  className,
  dataPw,
  id,
  label,
  placeholder,
  value,
}: {
  className?: string
  dataPw: string
  id: string
  label: string
  placeholder: string
  value: string[]
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={id}
        data-pw={dataPw}
        rows={5}
        defaultValue={value.join('\n')}
        placeholder={placeholder}
        className={className}
      />
    </div>
  )
}
