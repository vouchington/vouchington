import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CopyrightStaffLegalHoldTargetSelector,
  CopyrightStaffProceedingFields,
} from './copyright-staff-legal-hold-fields'

describe('copyright staff legal-hold fields', () => {
  it('records proceeding facts and toggles covered targets', () => {
    const setProceedingKind = vi.fn<(value: 'none' | 'federal_court' | 'ccb') => void>()
    const setCcbClaimKind = vi.fn<(value: 'claim' | 'counterclaim') => void>()
    const setFromOriginalClaimant = vi.fn<(value: boolean) => void>()
    const setSameMaterial = vi.fn<(value: boolean) => void>()
    const setCommencedAt = vi.fn<(value: string) => void>()
    const setReceivedAt = vi.fn<(value: string) => void>()
    const setSelectedTargetIds =
      vi.fn<(value: string[] | ((current: string[]) => string[])) => void>()
    render(
      <>
        <CopyrightStaffProceedingFields
          ccbClaimKind='claim'
          commencedAt='2026-07-01T12:00'
          fromOriginalClaimant={false}
          proceedingKind='ccb'
          receivedAt='2026-07-01T12:30'
          sameMaterial={false}
          setCcbClaimKind={setCcbClaimKind}
          setCommencedAt={setCommencedAt}
          setFromOriginalClaimant={setFromOriginalClaimant}
          setProceedingKind={setProceedingKind}
          setReceivedAt={setReceivedAt}
          setSameMaterial={setSameMaterial}
        />
        <CopyrightStaffLegalHoldTargetSelector
          holdId='hold-1'
          selectedTargetIds={['target-1']}
          setSelectedTargetIds={setSelectedTargetIds}
          targets={[
            {
              id: 'target-1',
              placement_key: 'image-placement:one',
              placement_revision: 1,
              image_id: 'image-1',
              hosted_use_url: 'https://voucha.ai/discussion/one',
            },
            {
              id: 'target-2',
              placement_key: 'image-placement:two',
              placement_revision: 1,
              image_id: 'image-2',
              hosted_use_url: 'https://voucha.ai/discussion/two',
            },
          ]}
        />
      </>,
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Proceeding' }))
    fireEvent.click(screen.getByRole('option', { name: 'Federal court' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'CCB filing kind' }))
    fireEvent.click(screen.getByRole('option', { name: 'Counterclaim' }))
    fireEvent.click(screen.getByLabelText('Filing came from the original claimant'))
    fireEvent.click(screen.getByLabelText('Filing covers the same material'))
    fireEvent.change(screen.getByLabelText('Proceeding commenced'), {
      target: { value: '2026-07-02T12:00' },
    })
    fireEvent.change(screen.getByLabelText('Designated agent received proof'), {
      target: { value: '2026-07-02T12:30' },
    })
    fireEvent.click(screen.getByLabelText(/Target 1:/))
    fireEvent.click(screen.getByLabelText(/Target 2:/))
    expect(setProceedingKind).toHaveBeenCalledWith('federal_court')
    expect(setCcbClaimKind).toHaveBeenCalledWith('counterclaim')
    expect(setFromOriginalClaimant).toHaveBeenCalledWith(true)
    expect(setSameMaterial).toHaveBeenCalledWith(true)
    expect(setCommencedAt).toHaveBeenCalled()
    expect(setReceivedAt).toHaveBeenCalled()
    expect(setSelectedTargetIds).toHaveBeenCalled()
  })
})
