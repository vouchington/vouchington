import { describe, expect, it, vi } from 'vitest'
import { checkDuckDbRuntime } from './image-smoke.mts'

describe('DuckDB image runtime probe', () => {
  it('reports completion of the image native query probe', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      await expect(checkDuckDbRuntime()).resolves.toBeUndefined()
      expect(output).toHaveBeenCalledWith(
        expect.stringMatching(/^✓ DuckDB native query returned 42 \(runtime .+\)$/),
      )
    } finally {
      output.mockRestore()
    }
  })
})
