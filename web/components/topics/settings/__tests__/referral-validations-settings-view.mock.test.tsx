import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReferralLinkValidation } from '@/lib/api/client/referral-link-validations'
import type { ReferralValidationsSettingsLabels } from '../referral-validations-settings-labels'
import { ReferralValidationsSettingsView } from '../referral-validations-settings-view'

vi.mock(import('@/components/referral-links/validations/link-validation-form'), () => ({
  LinkValidationForm: ({ referralProgramId }: { referralProgramId: string }) => (
    <form
      data-testid='link-validation-form'
      data-program={referralProgramId}
    />
  ),
}))

vi.mock(import('@/components/referral-links/validations/unlink-validation-button'), () => ({
  UnlinkValidationButton: ({
    referralProgramId,
    validationId,
    slug,
  }: {
    referralProgramId: string
    validationId: string
    slug: string
  }) => (
    <button
      type='button'
      aria-label={`Unlink ${slug}`}
      data-testid={`unlink-${validationId}`}
      data-program={referralProgramId}
      data-slug={slug}
    />
  ),
}))

const labels: ReferralValidationsSettingsLabels = {
  linkAValidation: 'Link a validation',
  manageAllValidations: 'Manage all validations',
  linkedValidations: 'Linked validations',
  empty: 'No validation sets linked to this program.',
}

const basePath = '/referral-program/amex-referrals/validations'

function validation(overrides: Partial<ReferralLinkValidation> = {}): ReferralLinkValidation {
  return {
    id: 'validation-chase-sapphire',
    slug: 'chase-sapphire-reserve',
    user_help_text: 'Use the public referral link.',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderView(linkedValidations: ReferralLinkValidation[]) {
  return render(
    <ReferralValidationsSettingsView
      referralProgramId='program-amex'
      linkedValidations={linkedValidations}
      validationsBasePath={basePath}
      labels={labels}
    />,
  )
}

describe('ReferralValidationsSettingsView', () => {
  it('shows the empty state and the link form', () => {
    renderView([])

    expect(screen.getByRole('heading', { name: 'Link a validation' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Manage all validations' })).toHaveAttribute(
      'href',
      basePath,
    )
    expect(screen.getByTestId('link-validation-form')).toHaveAttribute(
      'data-program',
      'program-amex',
    )
    expect(screen.getByText('No validation sets linked to this program.')).toBeDefined()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('links each validation and shows its help text', () => {
    renderView([validation()])

    expect(screen.getByRole('link', { name: 'chase-sapphire-reserve' })).toHaveAttribute(
      'href',
      `${basePath}/validation-chase-sapphire`,
    )
    expect(screen.getByText('Use the public referral link.')).toBeDefined()
    expect(screen.getByTestId('unlink-validation-chase-sapphire')).toHaveAttribute(
      'data-program',
      'program-amex',
    )
    expect(screen.getByTestId('unlink-validation-chase-sapphire')).toHaveAttribute(
      'data-slug',
      'chase-sapphire-reserve',
    )
  })

  it('omits help text when the validation has none', () => {
    renderView([validation({ id: 'validation-empty-help', user_help_text: '' })])

    expect(screen.getByRole('link', { name: 'chase-sapphire-reserve' })).toBeDefined()
    expect(screen.queryByText('Use the public referral link.')).toBeNull()
  })
})
