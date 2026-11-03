import { describe, it, expect } from 'vitest'
import {
  computeContentSha256,
  computeDetectionKey,
  runDetection,
  runDetectionMany,
} from '../detect.mts'

const ENGLISH = 'The quick brown fox jumps over the lazy dog near the quiet river bank today'
const GERMAN = 'Die Würde des Menschen ist unantastbar und ihr Schutz ist Verpflichtung aller'

describe('detect', () => {
  describe('computeContentSha256', () => {
    it('returns a 32-byte Buffer', () => {
      const result = computeContentSha256('hello world')
      expect(result).toBeInstanceOf(Buffer)
      expect(result.length).toBe(32)
    })

    it('returns different hashes for different inputs', () => {
      const a = computeContentSha256('text one')
      const b = computeContentSha256('text two')
      expect(a.equals(b)).toBe(false)
    })
  })

  describe('computeDetectionKey', () => {
    it('includes both text and declared language in key', () => {
      const withLang = computeDetectionKey('hello', 'en')
      const withoutLang = computeDetectionKey('hello', null)
      expect(withLang.equals(withoutLang)).toBe(false)
    })

    it('returns same key for same text+language', () => {
      const a = computeDetectionKey('hello world', 'en')
      const b = computeDetectionKey('hello world', 'en')
      expect(a.equals(b)).toBe(true)
    })
  })

  describe('runDetection', () => {
    it('returns declared source when declaredLanguage is provided', async () => {
      const result = await runDetection(ENGLISH, 'de')
      expect(result.source).toBe('declared')
      expect(result.linguaRsDetectedLanguage).toBe('de')
      expect(result.results).toEqual({ source: 'declared', language: 'de' })
    })

    it('returns none source for empty/whitespace text with no declared language', async () => {
      const result = await runDetection('   ', null)
      expect(result.source).toBe('none')
      expect(result.linguaRsDetectedLanguage).toBeNull()
      expect(result.results).toEqual({ source: 'none' })
    })

    it('detects the language of non-empty text with no declared language', async () => {
      const result = await runDetection(GERMAN, null)
      expect(result.source).toBe('lingua')
      expect(result.linguaRsDetectedLanguage).toBe('de')
      expect(result.results).toMatchObject({ source: 'lingua', detector: 'lingua' })
    })

    it('contentSha256 is the sha256 of the text', async () => {
      const result = await runDetection(ENGLISH, null)
      expect(result.contentSha256.equals(computeContentSha256(ENGLISH))).toBe(true)
    })
  })

  describe('runDetectionMany', () => {
    it('rejects an incomplete final output array', async () => {
      const firstInput = { text: 'Hello world', declaredLanguage: 'en' }
      const inputs = [firstInput, { text: 'Bonjour monde', declaredLanguage: 'fr' }]
      Object.defineProperty(inputs, 0, {
        get() {
          inputs.length = 1
          return firstInput
        },
      })

      await expect(runDetectionMany(inputs)).rejects.toThrow(
        'Language detection did not produce a result for input at index 1',
      )
    })

    it('resolves declared languages without detecting the text', async () => {
      const results = await runDetectionMany([
        { text: ENGLISH, declaredLanguage: 'fr' },
        { text: GERMAN, declaredLanguage: 'es' },
      ])
      expect(results.map(r => [r.source, r.linguaRsDetectedLanguage])).toEqual([
        ['declared', 'fr'],
        ['declared', 'es'],
      ])
    })

    it('resolves empty texts as none', async () => {
      const results = await runDetectionMany([
        { text: '   ', declaredLanguage: null },
        { text: '', declaredLanguage: null },
      ])
      expect(results.map(r => [r.source, r.linguaRsDetectedLanguage])).toEqual([
        ['none', null],
        ['none', null],
      ])
    })

    it('detects each text that needs detection', async () => {
      const results = await runDetectionMany([
        { text: ENGLISH, declaredLanguage: null },
        { text: GERMAN, declaredLanguage: null },
      ])
      expect(results.map(r => [r.source, r.linguaRsDetectedLanguage])).toEqual([
        ['lingua', 'en'],
        ['lingua', 'de'],
      ])
    })

    it('mixes declared, empty, and lingua results in correct order', async () => {
      const results = await runDetectionMany([
        { text: 'Hello', declaredLanguage: 'en' },
        { text: '   ', declaredLanguage: null },
        { text: 'こんにちは', declaredLanguage: null },
      ])
      expect(results.map(r => [r.source, r.linguaRsDetectedLanguage])).toEqual([
        ['declared', 'en'],
        ['none', null],
        ['lingua', 'ja'],
      ])
    })
  })
})
