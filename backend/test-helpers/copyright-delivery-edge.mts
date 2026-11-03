import { vi } from 'vitest'
import { installTestMediaDeliveryEdge } from './media-delivery-edge.mts'

type TestMediaDeliveryEdge = ReturnType<typeof installTestMediaDeliveryEdge>

/** Makes every registry write for `state` reject with `failure`; other writes reach the edge. */
export function rejectTestMediaDeliveryEdgeState(
  edge: TestMediaDeliveryEdge,
  state: 'allow' | 'withheld',
  failure: Error,
): void {
  edge.put.mockImplementation(async input => {
    if (input.state === state) throw failure
    edge.accept(input)
    return { $metadata: {} }
  })
}

/** Returns the edge double to accepting every registry write. */
export function acceptTestMediaDeliveryEdgeWrites(edge: TestMediaDeliveryEdge): void {
  edge.put.mockImplementation(async input => {
    edge.accept(input)
    return { $metadata: {} }
  })
}

/**
 * Runs `run` against an AWS edge double that rejects every registry write, then restores the env
 * stubs and spies it installed. Callers must not have an edge installed of their own.
 */
export async function withFailingTestMediaDeliveryEdge<T>(
  failure: Error,
  run: () => Promise<T>,
): Promise<T> {
  const edge = installTestMediaDeliveryEdge()
  edge.put.mockRejectedValue(failure)
  try {
    return await run()
  } finally {
    vi.unstubAllEnvs()
    edge.put.mockRestore()
    edge.invalidatePath.mockRestore()
  }
}
