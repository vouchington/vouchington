import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffInformationRequests } from './copyright-staff-information-requests'

type Intent = CopyrightStaffQueueItem['delivery_intents'][number]

function intent(overrides: Partial<Intent>): Intent {
  return {
    id: crypto.randomUUID(),
    delivery_kind: 'staff_information_request',
    channel: 'email',
    state: 'pending',
    delivery_attempt_count: 0,
    ...overrides,
  }
}

describe('CopyrightStaffInformationRequests', () => {
  it.each([
    { state: 'pending', label: 'Queued' },
    { state: 'claimed', label: 'Queued' },
    { state: 'sent', label: 'Sent' },
    { state: 'failed', label: 'Failed' },
    { state: 'bounced', label: 'Bounced' },
  ] as const)('shows a $state request as $label', ({ state, label }) => {
    render(<CopyrightStaffInformationRequests notice={{ delivery_intents: [intent({ state })] }} />)

    expect(screen.getByText('Information request 1 emailed to the claimant')).toBeVisible()
    expect(screen.getByText(label)).toBeVisible()
  })

  it.each([
    { state: 'failed', note: /has not been reached/ },
    { state: 'bounced', note: /did not accept the email/ },
  ] as const)('explains what to do about a $state request', ({ state, note }) => {
    render(<CopyrightStaffInformationRequests notice={{ delivery_intents: [intent({ state })] }} />)

    expect(screen.getByText(note)).toBeVisible()
  })

  it.each(['pending', 'sent'] as const)('adds no warning to a %s request', state => {
    render(<CopyrightStaffInformationRequests notice={{ delivery_intents: [intent({ state })] }} />)

    expect(screen.queryByText(/claimant (has not|address)/)).toBeNull()
  })

  it('numbers each request and ignores deliveries of other kinds', () => {
    render(
      <CopyrightStaffInformationRequests
        notice={{
          delivery_intents: [
            intent({ delivery_kind: 'claimant_receipt', state: 'sent' }),
            intent({ state: 'sent' }),
            intent({ state: 'pending' }),
          ],
        }}
      />,
    )

    expect(screen.getByText('Information request 1 emailed to the claimant')).toBeVisible()
    expect(screen.getByText('Information request 2 emailed to the claimant')).toBeVisible()
    expect(screen.queryByText(/Information request 3/)).toBeNull()
  })

  it('renders nothing when no information request was emailed', () => {
    const { container } = render(
      <CopyrightStaffInformationRequests
        notice={{ delivery_intents: [intent({ delivery_kind: 'claimant_receipt' })] }}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
