import { afterEach, describe, expect, it, vi } from 'vitest'
import { geminiEmbeddingsBatchConfig } from '../services/embeddings/batch/config.mts'
import { initializeEmbeddingCreationConfig } from './embedding-creation-config.mts'

describe('embedding creation config', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not wait for unrelated dynamic config startup', async () => {
    const waited: string[] = []
    const prototype = Object.getPrototypeOf(geminiEmbeddingsBatchConfig) as {
      waitForInitialization(): Promise<void>
      close(): Promise<void>
    }
    vi.spyOn(prototype, 'waitForInitialization').mockImplementation(async function (this: {
      key: string
    }) {
      waited.push(this.key)
      if (this.key !== geminiEmbeddingsBatchConfig.key) return new Promise(() => {})
    })
    vi.spyOn(prototype, 'close').mockResolvedValue()

    await initializeEmbeddingCreationConfig()

    expect(waited).toEqual([geminiEmbeddingsBatchConfig.key])
  })
})
