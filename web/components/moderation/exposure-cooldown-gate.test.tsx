import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExposureCooldownGate } from './exposure-cooldown-gate'
import type { UseExposureCooldownReturn } from './use-exposure-cooldown'

describe('ExposureCooldownGate', () => {
  it('keeps unrelated moderation actions enabled during a reveal cooldown', () => {
    const cooldown: UseExposureCooldownReturn = {
      exposureState: {
        count: 10,
        threshold: 10,
        in_cooldown: true,
        cooldown_ends_at: '2099-01-01T00:00:00Z',
      },
      exposureStateIsStale: false,
      revealBlocked: true,
      recordReveal: vi.fn<() => void>(),
      refreshExposureState: vi.fn<() => Promise<void>>(),
      dismissBreakPrompt: vi.fn<() => void>(),
      showBreakPrompt: true,
    }

    const { container } = render(
      <ExposureCooldownGate cooldown={cooldown}>
        <button type='button'>Approve post</button>
      </ExposureCooldownGate>,
    )

    expect(screen.getByRole('button', { name: 'Approve post' })).toBeEnabled()
    expect(container.querySelector('[data-pw="exposure-cooldown-gate"]')).not.toHaveClass(
      'pointer-events-none',
    )
    expect(document.querySelector('[data-pw="dialog-overlay"]')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-modal', 'true')
  })
})
