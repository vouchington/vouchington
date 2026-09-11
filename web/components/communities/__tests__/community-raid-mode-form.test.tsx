import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommunityRaidModeForm } from '../community-raid-mode-form'
import { initialRaidModeState } from '../community-raid-mode-state'

describe('CommunityRaidModeForm', () => {
  it('passes changed restriction and reason values to callers', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    const onToggle = vi.fn<VitestLooseMock>()
    const onDurationChange = vi.fn<VitestLooseMock>()
    const onReasonChange = vi.fn<VitestLooseMock>()

    render(
      <CommunityRaidModeForm
        state={initialRaidModeState}
        isBusy={false}
        onSubmit={onSubmit}
        onToggle={onToggle}
        onDurationChange={onDurationChange}
        onReasonChange={onReasonChange}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Block links' }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'vote spike' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Activate' }).closest('form')!)

    expect(onToggle).toHaveBeenCalledWith('no_links', true)
    expect(onReasonChange).toHaveBeenCalledWith('vote spike')
    expect(onSubmit).toHaveBeenCalled()
    expect(onDurationChange).not.toHaveBeenCalled()
  })
})
