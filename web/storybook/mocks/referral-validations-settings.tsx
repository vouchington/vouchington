'use client'

import Link from 'next/link'
import { LinkValidationForm } from '@/components/referral-links/validations/link-validation-form'
import { UnlinkValidationButton } from '@/components/referral-links/validations/unlink-validation-button'
import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReferralValidationsSettingsProps {
  referralProgramId: string
  linkedValidations: ReferralLinkValidation[]
  validationsBasePath: string
}

export function ReferralValidationsSettings({
  referralProgramId,
  linkedValidations,
  validationsBasePath,
}: ReferralValidationsSettingsProps) {
  const t = useTranslations()
  return (
    <div
      className='space-y-8'
      data-pw='topic-settings-validations'
    >
      <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
        <div className='mb-4 flex items-center justify-between'>
          <h2
            className='text-xl font-semibold text-foreground'
            data-pw='link-validation-heading'
          >
            {t('extracted.settings.referralValidationsSettings.linkAValidation_bdb222c6')}
          </h2>
          <Link
            href={validationsBasePath}
            prefetch={false}
            className='text-sm text-primary hover:text-primary/80'
            data-pw='referral-program-validations-manage-button'
          >
            {t('extracted.settings.referralValidationsSettings.manageAllValidations_74b7fb7b')}
          </Link>
        </div>
        <div className='max-w-lg'>
          <LinkValidationForm referralProgramId={referralProgramId} />
        </div>
      </section>
      <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
        <h2
          className='mb-4 text-xl font-semibold text-foreground'
          data-pw='linked-validations-heading'
        >
          {t('extracted.settings.referralValidationsSettings.linkedValidations_aa3b7e70')}
        </h2>
        {linkedValidations.length === 0 ? (
          <p
            className='text-sm text-muted-foreground'
            data-pw='linked-validations-empty'
          >
            {t(
              'extracted.settings.referralValidationsSettings.noValidationSetsLinkedToThis_14d2cedb',
            )}
          </p>
        ) : (
          <ul
            className='divide-y divide-border'
            data-pw='linked-validations-table'
          >
            {linkedValidations.map(validation => (
              <li
                key={validation.id}
                className='flex items-center justify-between py-3'
              >
                <div className='space-y-1'>
                  <Link
                    prefetch={false}
                    href={`${validationsBasePath}/${validation.id}`}
                    // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                    data-pw={`linked-validation-link-${validation.id}`}
                    className='text-sm font-medium text-primary hover:text-primary/80'
                  >
                    {validation.slug}
                  </Link>
                  {validation.user_help_text ? (
                    <p className='text-sm text-muted-foreground'>{validation.user_help_text}</p>
                  ) : null}
                </div>
                <UnlinkValidationButton
                  referralProgramId={referralProgramId}
                  validationId={validation.id}
                  slug={validation.slug}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
