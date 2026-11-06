'use client'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PrivacyTogglesProps {
  pending: Set<string>
  processingRestricted: boolean
  thirdPartyMarketing: boolean
  onMarketingChange: (enabled: boolean) => void
  onRestrictProcessingChange: (enabled: boolean) => void
}

export function PrivacyToggles({
  pending,
  processingRestricted,
  thirdPartyMarketing,
  onMarketingChange,
  onRestrictProcessingChange,
}: PrivacyTogglesProps) {
  const t = useTranslations()
  return (
    <>
      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.privacyForm.privacyToggles.marketingCommunications_0f27f490')}
        </h2>
        <div className='flex items-start gap-4'>
          <Switch
            id='should_receive_third_party_marketing'
            checked={thirdPartyMarketing}
            onCheckedChange={onMarketingChange}
            disabled={pending.has('should_receive_third_party_marketing')}
            data-pw='third-party-marketing-toggle'
          />
          <div className='space-y-1'>
            <Label htmlFor='should_receive_third_party_marketing'>Third-Party Marketing</Label>
            <p className='text-sm text-muted-foreground'>
              Allow us to share your information with trusted partners for marketing purposes.
            </p>
          </div>
        </div>
      </section>
      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.privacyForm.privacyToggles.dataProcessing_b40804ab')}
        </h2>
        <div className='flex items-start gap-4'>
          <Switch
            id='processing_restricted_at'
            checked={processingRestricted}
            onCheckedChange={onRestrictProcessingChange}
            disabled={pending.has('processing_restricted_at')}
            data-pw='processing-restricted-toggle'
          />
          <div className='space-y-1'>
            <Label htmlFor='processing_restricted_at'>Restrict Processing</Label>
            <p className='text-sm text-muted-foreground'>
              When enabled, your data will be preserved but hidden from search and recommendations.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
