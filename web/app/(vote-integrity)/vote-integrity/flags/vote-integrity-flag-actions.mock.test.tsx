import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VoteIntegrityFlag } from '@/types/vote-integrity'
import type { VoteIntegrityFlagsState } from './use-vote-integrity-flags'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key.endsWith('penaltyApplied_c21b6fb4')) return 'Penalty applied'
    if (key.endsWith('countPenalized_2a7e9c14')) return `${values?.count} penalized`
    return key
  },
}))

import { ApplyPenaltyButton } from './vote-integrity-flag-actions'

const flag = {
  id: 'flag-1',
} as VoteIntegrityFlag

function state(overrides: Partial<VoteIntegrityFlagsState>) {
  return {
    actionLoading: {},
    applyPenaltyWithConfirmation: vi.fn<VitestLooseMock>(),
    handleResolve: vi.fn<VitestLooseMock>(),
    penaltyApplied: {},
    penaltyConfirm: {},
    penaltyResults: {},
    resolutions: {},
    ...overrides,
  } as unknown as VoteIntegrityFlagsState
}

describe('ApplyPenaltyButton', () => {
  it('shows a reconciled penalty as applied and prevents another submission', () => {
    const applyPenaltyWithConfirmation = vi.fn<VitestLooseMock>()
    render(
      <ApplyPenaltyButton
        flag={flag}
        state={state({
          applyPenaltyWithConfirmation,
          penaltyApplied: { [flag.id]: true },
        })}
      />,
    )

    const button = screen.getByRole('button', { name: 'Penalty applied' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(applyPenaltyWithConfirmation).not.toHaveBeenCalled()
  })

  it('keeps the direct-success count label', () => {
    render(
      <ApplyPenaltyButton
        flag={flag}
        state={state({
          penaltyApplied: { [flag.id]: true },
          penaltyResults: { [flag.id]: 3 },
        })}
      />,
    )

    expect(screen.getByRole('button', { name: '3 penalized' })).toBeDisabled()
  })
})
