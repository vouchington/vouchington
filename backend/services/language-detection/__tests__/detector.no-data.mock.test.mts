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
    it('returns an array of detection results', async () => {
      const inputs = [Buffer.from('Hello world', 'utf8'), Buffer.from('Hallo Welt', 'utf8')]
      const results = await detectLanguageMany(inputs)
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]?.detector).toBe('lingua')
    })

    it('passes options through to the underlying module', async () => {
      const inputs = [Buffer.from('test', 'utf8')]
      await detectLanguageMany(inputs, { lowAccuracy: true })

      expect(detectLanguageManyMock).toHaveBeenCalledWith(inputs, { lowAccuracy: true })
    })
  })
})

describe('detector interface contract (lingua-rs present)', () => {
  // The unavailable/throw path is covered separately in detector-unavailable.mock.test.mts
  // (needs a fresh module so the per-file cachedMod resolves to null).
  it('detectLanguage result conforms to LinguaDetectionResult interface', async () => {
    const result = await detectLanguage(Buffer.from('test', 'utf8'))
    expect(typeof result.detector).toBe('string')
    expect(typeof result.detectorModelVersion).toBe('string')
    expect(Array.isArray(result.languages)).toBe(true)
  })

  it('detectLanguageMany result array items conform to LinguaDetectionResult interface', async () => {
    const results = await detectLanguageMany([Buffer.from('test', 'utf8')])
    expect(Array.isArray(results)).toBe(true)
    for (const r of results) {
      expect(typeof r.detector).toBe('string')
      expect(typeof r.detectorModelVersion).toBe('string')
      expect(Array.isArray(r.languages)).toBe(true)
    }
  })
})
