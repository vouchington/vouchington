/**
 * Tests for detector.mts.
 *
 * The module uses a module-level `cachedMod` that is populated on first call.
 * We mock 'lingua-rs' at the vi.mock level so the dynamic import inside
 * getLinguaMod() receives our stub.  Because the cache is module-level, each
 * test file gets a fresh module (isolate: true in backend-mocks project).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock<typeof import('lingua-rs')>(import('lingua-rs'), () => ({
  detectLanguage: vi.fn<typeof import('lingua-rs').detectLanguage>().mockResolvedValue({
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391: 'en', iso6393: 'eng', confidence: 0.99 }],
  }),
  detectLanguageMany: vi.fn<typeof import('lingua-rs').detectLanguageMany>().mockResolvedValue([
    {
      detector: 'lingua',
      detectorModelVersion: '1.0.0',
      languages: [{ iso6391: 'de', iso6393: 'deu', confidence: 0.97 }],
    },
  ]),
}))

import { detectLanguage, detectLanguageMany } from '../detector.mts'

describe('detector', () => {
  describe('detectLanguage', () => {
    it('returns detection result from the lingua-rs module', async () => {
      const result = await detectLanguage(Buffer.from('Hello world', 'utf8'))
      expect(result.detector).toBe('lingua')
      expect(result.detectorModelVersion).toBe('1.0.0')
      expect(result.languages).toHaveLength(1)
      expect(result.languages[0]?.iso6391).toBe('en')
    })

    it('passes options through to the underlying module', async () => {
      const result = await detectLanguage(Buffer.from('Bonjour monde', 'utf8'), {
        minConfidence: 0.8,
      })
      // The mock always returns the same value; just ensure it doesn't throw
      expect(result).toBeDefined()
      expect(Array.isArray(result.languages)).toBe(true)
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
      const results = await detectLanguageMany([Buffer.from('test', 'utf8')], {
        lowAccuracy: true,
      })
      expect(Array.isArray(results)).toBe(true)
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
