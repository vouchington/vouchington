import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  replayCopyrightActionIntent,
  replayCopyrightDeliveryIntent,
} from '@/lib/api/client/copyright-notices'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffQueue } from './copyright-staff-queue'

vi.mock(import('@/lib/api/client/copyright-notices'), () => ({
  replayCopyrightActionIntent: vi.fn<VitestLooseMock>(),
  replayCopyrightDeliveryIntent: vi.fn<VitestLooseMock>(),
}))

const mockReplayAction = vi.mocked(replayCopyrightActionIntent)
const mockReplayDelivery = vi.mocked(replayCopyrightDeliveryIntent)
const originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')

describe('CopyrightStaffQueue recovery actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReplayAction.mockResolvedValue(undefined)
    mockReplayDelivery.mockResolvedValue(undefined)
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: vi.fn<VitestLooseMock>() },
      writable: true,
    })
  })

  afterEach(() => {
    if (originalLocationDescriptor)
      Object.defineProperty(window, 'location', originalLocationDescriptor)
  })

  it('retries failed action and delivery intents without a decision rationale', async () => {
    render(<CopyrightStaffQueue notices={[makeNotice()]} />)

    const retries = screen.getAllByRole('button', { name: 'Retry' })
    expect(retries).toHaveLength(2)
    expect(retries[0]).toBeEnabled()
    expect(retries[1]).toBeEnabled()

    fireEvent.click(retries[0]!)
    await waitFor(() => {
      expect(mockReplayAction).toHaveBeenCalledWith('case-123', 'action-intent-123')
    })

    fireEvent.click(retries[1]!)
    await waitFor(() => {
      expect(mockReplayDelivery).toHaveBeenCalledWith('case-123', 'delivery-intent-123')
    })
  })
})

function makeNotice(): CopyrightStaffQueueItem {
  return {
    id: 'case-123',
    jurisdiction: 'us_dmca',
    received_at: '2026-01-01T00:00:00.000Z',
    claimant: { display_name: 'Claimant', contact: 'claimant@example.test' },
    work_description: 'Original photograph.',
    targets: [],
    evidence: [],
    form_review: null,
    restrictions: [],
    appeals: [],
    counter_notices: [],
    legal_holds: [],
    action_intents: [
      {
        id: 'action-intent-123',
        action: 'withhold',
        state: 'failed',
        failure_message: 'Delivery provider unavailable.',
      },
    ],
    delivery_intents: [
      {
        id: 'delivery-intent-123',
        delivery_kind: 'poster_notice',
        channel: 'email',
        state: 'failed',
        delivery_attempt_count: 3,
      },
    ],
    email_correspondence: [],
  }
}
