/**
 * Tests for detector.mts.
 *
 * The module uses a module-level `cachedMod` that is populated on first call.
 * Reset the module registry and register the mock before dynamically importing
 * detector.mts so its module-level cache cannot retain a real native addon from
 * an earlier import.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'

const detectLanguageMock = vi.fn<typeof import('lingua-rs').detectLanguage>().mockResolvedValue({
  detector: 'lingua',
  detectorModelVersion: '1.0.0',
  languages: [{ iso6391: 'en', iso6393: 'eng', confidence: 0.99 }],
})
const detectLanguageManyMock = vi
  .fn<typeof import('lingua-rs').detectLanguageMany>()
  .mockResolvedValue([
    {
      detector: 'lingua',
      detectorModelVersion: '1.0.0',
      languages: [{ iso6391: 'de', iso6393: 'deu', confidence: 0.97 }],
    },
  ])

vi.resetModules()
vi.doMock<typeof import('lingua-rs')>(import('lingua-rs'), () => ({
  detectLanguage: detectLanguageMock,
  detectLanguageMany: detectLanguageManyMock,
}))

const { detectLanguage, detectLanguageMany } = await import('../detector.mts')

describe('detector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detectLanguage', () => {
    it('returns detection result from the lingua-rs module', async () => {
      const result = await detectLanguage(Buffer.from('Hello world', 'utf8'))
      expect(result.detector).toBe('lingua')
      expect(result.detectorModelVersion).toBe('1.0.0')
      expect(result.languages).toHaveLength(1)
      expect(result.languages[0]?.iso6391).toBe('en')
    })

    it('passes options through to the underlying module', async () => {
      const input = Buffer.from('Bonjour monde', 'utf8')
      await detectLanguage(input, { minConfidence: 0.8 })

      expect(detectLanguageMock).toHaveBeenCalledWith(input, { minConfidence: 0.8 })
    })
  })

  describe('detectLanguageMany', () => {
    it('passes options through to the underlying module', async () => {
      const inputs = [Buffer.from('test', 'utf8')]
      const results = await detectLanguageMany(inputs, { lowAccuracy: true })

      expect(results[0]?.languages[0]?.iso6391).toBe('de')
      expect(detectLanguageManyMock).toHaveBeenCalledWith(inputs, { lowAccuracy: true })
    })
  })
})
