'use client'

// oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Privacy toggle call sites pass literal test IDs through this shared row.
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
        <PrivacySwitchRow
          id='third_party_marketing'
          checked={thirdPartyMarketing}
          dataPw='third-party-marketing-toggle'
          disabled={pending.has('third_party_marketing')}
          label='Third-Party Marketing'
          description='Allow us to share your information with trusted partners for marketing purposes.'
          onCheckedChange={onMarketingChange}
        />
      </section>
      <section className='space-y-4'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.privacyForm.privacyToggles.dataProcessing_b40804ab')}
        </h2>
        <PrivacySwitchRow
          id='processing_restricted_at'
          checked={processingRestricted}
          dataPw='processing-restricted-toggle'
          disabled={pending.has('processing_restricted_at')}
          label='Restrict Processing'
          description='When enabled, your data will be preserved but hidden from search and recommendations.'
          onCheckedChange={onRestrictProcessingChange}
        />
      </section>
    </>
  )
}

function PrivacySwitchRow({
  checked,
  dataPw,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean
  dataPw: string
  description: string
  disabled: boolean
  id: string
  label: string
  onCheckedChange: (enabled: boolean) => void
}) {
  return (
    <div className='flex items-start gap-4'>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        data-pw={dataPw}
      />
      <div className='space-y-1'>
        <Label htmlFor={id}>{label}</Label>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
    </div>
  )
}
