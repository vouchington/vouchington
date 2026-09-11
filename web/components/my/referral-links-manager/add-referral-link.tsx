'use client'

import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'

interface AddReferralLinkProps {
  onSelectProgram: (id: string) => void
}

export function AddReferralLink({ onSelectProgram }: AddReferralLinkProps) {
  const t = useTranslations()
  return (
    <div className='rounded-md border p-4'>
      <h3
        className='mb-3 text-sm font-semibold'
        data-pw='add-referral-link-heading'
      >
        {t('extracted.referralLinksManager.addReferralLink.addAReferralLink_e0cd1809')}
      </h3>
      <p className='mb-3 text-sm text-muted-foreground'>
        {t('extracted.referralLinksManager.addReferralLink.searchForAReferralProgramTo_838d31ca')}
      </p>
      <TopicAutocomplete
        value={null}
        label=''
        topicTypes={['referral_program']}
        placeholder={t(
          'extracted.referralLinksManager.addReferralLink.searchReferralPrograms_cd970fdc',
        )}
        ariaLabel={t(
          'extracted.referralLinksManager.addReferralLink.searchReferralPrograms_fee3e372',
        )}
        onChange={onSelectProgram}
      />
    </div>
  )
}
