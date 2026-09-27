import { describe } from 'vitest'
import { render } from '@testing-library/react'
import { registerManagerKeyboardTests } from '@/test-helpers/components/my/manager-keyboard-submit'
import {
  initialPointValuationData,
  initialPointValuations,
  mockCreatePointValuation,
  mockUpdatePointValuation,
} from '@/test-helpers/components/my/point-valuations-manager.mock-support'
// Imported after the mock helper so its vi.mock factories run first.
import { PointValuationsManager } from '../point-valuations-manager'

describe('PointValuationsManager keyboard submit', () => {
  registerManagerKeyboardTests({
    renderManager: () => render(<PointValuationsManager initialData={initialPointValuationData} />),
    prepareMocks: () => {
      mockCreatePointValuation.mockResolvedValue({
        point_valuation: {
          id: 'pv-2',
          rewards_program_id: 'prog-2',
          value_per_point: { amount: 20_000, currency: 'usd', scale: 6 },
          note: null,
          rewards_program: { id: 'prog-2', name: 'Amex MR', slug: 'amex-mr' },
        },
      } as any)
      mockUpdatePointValuation.mockResolvedValue({
        point_valuation: { ...initialPointValuations[0], note: 'Updated note' },
      } as any)
    },
    autocompleteValue: 'prog-2',
    valueLabel: 'Value per point',
    addValue: '0.02',
    editValue: '2.0',
    onCreate: mockCreatePointValuation,
    onUpdate: mockUpdatePointValuation,
  })
})
