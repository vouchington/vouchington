import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCopyrightTargetSelection } from './copyright-target-selection'

describe('useCopyrightTargetSelection', () => {
  it('defaults to every target and then keeps only still-valid selections', () => {
    const { result, rerender } = renderHook(
      ({ targetIds }: { targetIds: string[] }) => useCopyrightTargetSelection(targetIds),
      { initialProps: { targetIds: ['a', 'b'] } },
    )
    expect(result.current[0]).toEqual(['a', 'b'])
    act(() => result.current[1](['b', 'gone']))
    rerender({ targetIds: ['a', 'b'] })
    expect(result.current[0]).toEqual(['b'])
  })
})
