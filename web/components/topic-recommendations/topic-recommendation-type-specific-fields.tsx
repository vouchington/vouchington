'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { getRecommendationFormDefaults } from './topic-recommendation-form-codecs'
import type { TopicRecommendationTopicType } from './topic-recommendation-topic-type'

interface TopicRecommendationTypeSpecificFieldsProps {
  topicType: TopicRecommendationTopicType
  defaults: ReturnType<typeof getRecommendationFormDefaults>
}

export function TopicRecommendationTypeSpecificFields({
  topicType,
  defaults,
}: TopicRecommendationTypeSpecificFieldsProps) {
  const t = useTranslations()

  return (
    <>
      {topicType === 'referral_program' ? (
        <div className='space-y-2'>
          <Label htmlFor='example_referral_link'>
            {t(
              'extracted.topicRecommendations.topicRecommendationFormFields.exampleReferralLink_0642ba02',
            )}
          </Label>
          <Input
            id='example_referral_link'
            name='example_referral_link'
            type='url'
            placeholder={t(
              'extracted.topicRecommendations.topicRecommendationFormFields.httpsExampleComReferralRefYourcode_472c82b6',
            )}
            defaultValue={defaults.example_referral_link}
            data-pw='topic-recommendation-form-example-referral-link'
          />
        </div>
      ) : null}

      {topicType === 'card' ? (
        <div className='space-y-2'>
          <Label htmlFor='landing_page_urls'>
            {t(
              'extracted.topicRecommendations.topicRecommendationFormFields.landingPageUrls_1c16bb4a',
            )}
          </Label>
          <Textarea
            id='landing_page_urls'
            name='landing_page_urls'
            rows={4}
            placeholder={t(
              'extracted.topicRecommendations.topicRecommendationFormFields.httpsBankComCardXHttps_de209aeb',
            )}
            defaultValue={defaults.landing_page_urls}
            data-pw='topic-recommendation-form-landing-page-urls'
          />
          <p className='text-xs text-muted-foreground'>
            {t(
              'extracted.topicRecommendations.topicRecommendationFormFields.oneUrlPerLine_14a14d40',
            )}
          </p>
        </div>
      ) : null}
    </>
  )
}
