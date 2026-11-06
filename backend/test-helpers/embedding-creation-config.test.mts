import { afterEach, describe, expect, it, vi } from 'vitest'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import { initializeEmbeddingCreationConfig } from './embedding-creation-config.mts'

describe('embedding creation config', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not wait for unrelated dynamic config startup', async () => {
    const waited: string[] = []
    const prototype = Object.getPrototypeOf(bedrockEmbeddingsBatchConfig) as {
      waitForInitialization(): Promise<void>
      close(): Promise<void>
    }
    vi.spyOn(prototype, 'waitForInitialization').mockImplementation(async function (this: {
      key: string
    }) {
      waited.push(this.key)
      if (this.key !== bedrockEmbeddingsBatchConfig.key) return new Promise(() => {})
    })
    vi.spyOn(prototype, 'close').mockResolvedValue()

    await initializeEmbeddingCreationConfig()

    expect(waited).toEqual([bedrockEmbeddingsBatchConfig.key])
  })
})
