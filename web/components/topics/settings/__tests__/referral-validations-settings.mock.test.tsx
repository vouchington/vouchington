import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'
import type { ReferralValidationsSettingsViewProps } from '../referral-validations-settings-view'

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock(import('../referral-validations-settings-view'), () => ({
  ReferralValidationsSettingsView: ({
    referralProgramId,
    linkedValidations,
    validationsBasePath,
    labels,
  }: ReferralValidationsSettingsViewProps) => (
    <div
      data-testid='referral-validations-settings-view'
      data-program={referralProgramId}
      data-base={validationsBasePath}
      data-count={String(linkedValidations.length)}
      data-link={labels.linkAValidation}
      data-manage={labels.manageAllValidations}
      data-linked={labels.linkedValidations}
      data-empty={labels.empty}
    />
  ),
}))

import { ReferralValidationsSettings } from '../referral-validations-settings'

const linkedValidations: ReferralLinkValidation[] = [
  {
    id: 'validation-1',
    slug: 'sapphire',
    user_help_text: 'Help',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
]

describe('ReferralValidationsSettings', () => {
  it('passes server translations and the program props to the shared view', async () => {
    render(
      await ReferralValidationsSettings({
        referralProgramId: 'program-amex',
        linkedValidations,
        validationsBasePath: '/referral-program/amex-referrals/validations',
      }),
    )

    const view = screen.getByTestId('referral-validations-settings-view')
    expect(view).toHaveAttribute('data-program', 'program-amex')
    expect(view).toHaveAttribute('data-base', '/referral-program/amex-referrals/validations')
    expect(view).toHaveAttribute('data-count', '1')
    expect(view).toHaveAttribute(
      'data-link',
      'extracted.settings.referralValidationsSettings.linkAValidation_bdb222c6',
    )
    expect(view).toHaveAttribute(
      'data-manage',
      'extracted.settings.referralValidationsSettings.manageAllValidations_74b7fb7b',
    )
    expect(view).toHaveAttribute(
      'data-linked',
      'extracted.settings.referralValidationsSettings.linkedValidations_aa3b7e70',
    )
    expect(view).toHaveAttribute(
      'data-empty',
      'extracted.settings.referralValidationsSettings.noValidationSetsLinkedToThis_14d2cedb',
    )
  })
})
