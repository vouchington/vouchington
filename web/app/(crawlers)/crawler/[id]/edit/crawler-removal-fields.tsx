'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CrawlerResponse } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

export function CrawlerRemovalFields({ crawler }: { crawler: CrawlerResponse }) {
  const t = useTranslations()
  return (
    <>
      <div>
        <Label htmlFor='css_selectors_to_remove'>
          {t('extracted.edit.crawlerRemovalFields.cssSelectorsToRemoveOnePer_46e20d4b')}
        </Label>
        <Textarea
          id='css_selectors_to_remove'
          name='css_selectors_to_remove'
          data-pw='crawler-css-selectors-to-remove-input'
          rows={5}
          defaultValue={crawler.css_selectors_to_remove.join('\n')}
          placeholder={t('extracted.edit.crawlerRemovalFields.adBannerNewsletterSignup_b35ceb08')}
          className='mt-1 font-mono'
        />
      </div>
      <div>
        <Label htmlFor='link_text_content_to_remove'>
          {t('extracted.edit.crawlerRemovalFields.linkTextContentToRemoveOne_a8525d64')}
        </Label>
        <Textarea
          id='link_text_content_to_remove'
          name='link_text_content_to_remove'
          data-pw='crawler-link-text-content-to-remove-input'
          rows={5}
          defaultValue={crawler.link_text_content_to_remove.join('\n')}
          placeholder={t('extracted.edit.crawlerRemovalFields.subscribeAdvertisement_9d0d679f')}
          className='mt-1'
        />
      </div>
      <div>
        <Label htmlFor='link_hrefs_to_remove'>
          {t('extracted.edit.crawlerRemovalFields.linkHrefsToRemoveOnePer_d15f0816')}
        </Label>
        <Textarea
          id='link_hrefs_to_remove'
          name='link_hrefs_to_remove'
          data-pw='crawler-link-hrefs-to-remove-input'
          rows={5}
          defaultValue={crawler.link_hrefs_to_remove.join('\n')}
          placeholder={t('extracted.edit.crawlerRemovalFields.subscribeNewsletter_e731a5e6')}
          className='mt-1 font-mono'
        />
      </div>
    </>
  )
}
