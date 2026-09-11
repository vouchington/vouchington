import { mockLucideReact } from '@/test-helpers/lucide-icons'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FLUSH_CONCERNS } from '@/types/api-responses'

vi.mock(import('lucide-react'), () => mockLucideReact({ Loader2: () => <span>loading</span> }))

import { FlushConcernsCard } from '../flush-concerns-card'
import type { PendingValkeyAction } from '../valkey-state'

describe('FlushConcernsCard', () => {
  it('renders the card title and one row per flush concern', () => {
    render(
      <FlushConcernsCard
        flushLoading={{}}
        setPendingAction={vi.fn<(action: PendingValkeyAction) => void>()}
      />,
    )

    expect(screen.getByText('Flush Concerns')).toBeDefined()
    for (const concern of FLUSH_CONCERNS) {
      expect(screen.getByText(concern)).toBeDefined()
    }
    expect(screen.getAllByRole('button', { name: 'Flush' })).toHaveLength(FLUSH_CONCERNS.length)
  })

  it('clicking Flush sets the pending flush action for that concern', () => {
    const setPendingAction = vi.fn<(action: PendingValkeyAction) => void>()
    render(
      <FlushConcernsCard
        flushLoading={{}}
        setPendingAction={setPendingAction}
      />,
    )

    const buttons = screen.getAllByRole('button', { name: 'Flush' })
    const sessionsIndex = FLUSH_CONCERNS.indexOf('sessions')
    fireEvent.click(buttons[sessionsIndex]!)

    expect(setPendingAction).toHaveBeenCalledWith({ type: 'flush', concern: 'sessions' })
  })

  it('disables and shows a loading state for a concern with an in-flight flush', () => {
    const cachesIndex = FLUSH_CONCERNS.indexOf('caches')
    render(
      <FlushConcernsCard
        flushLoading={{ caches: true }}
        setPendingAction={vi.fn<(action: PendingValkeyAction) => void>()}
      />,
    )

    const buttons = screen.getAllByRole('button', { name: /Flush/ })
    expect(buttons[cachesIndex]).toBeDisabled()
  })
})
