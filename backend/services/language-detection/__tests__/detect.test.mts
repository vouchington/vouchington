import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeContentSha256,
  computeDetectionKey,
  runDetection,
  runDetectionMany,
} from '../detect.mts'
import type { detectLanguage, detectLanguageMany } from '../detector.mts'

const mockDetectLanguage = vi.fn<typeof detectLanguage>()
const mockDetectLanguageMany = vi.fn<typeof detectLanguageMany>()

function runDetectionForTest(...args: Parameters<typeof runDetection>) {
  const [text, declaredLanguage, opts, dependencies] = args
  return runDetection(text, declaredLanguage, opts, {
    detectLanguage: mockDetectLanguage,
    detectLanguageMany: mockDetectLanguageMany,
    ...dependencies,
  })
}

function runDetectionManyForTest(...args: Parameters<typeof runDetectionMany>) {
  const [inputs, opts, dependencies] = args
  return runDetectionMany(inputs, opts, {
    detectLanguage: mockDetectLanguage,
    detectLanguageMany: mockDetectLanguageMany,
    ...dependencies,
  })
}

describe('detect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('computeContentSha256', () => {
    it('returns a 32-byte Buffer', () => {
      const result = computeContentSha256('hello world')
      expect(result).toBeInstanceOf(Buffer)
      expect(result.length).toBe(32)
    })

    it('returns the same hash for the same input', () => {
      const a = computeContentSha256('same text')
      const b = computeContentSha256('same text')
      expect(a.equals(b)).toBe(true)
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

    it('treats null and empty-string declared language differently from a real tag', () => {
      const nullLang = computeDetectionKey('text', null)
      const realLang = computeDetectionKey('text', 'fr')
      expect(nullLang.equals(realLang)).toBe(false)
    })

    it('returns same key for same text+language', () => {
      const a = computeDetectionKey('hello world', 'en')
      const b = computeDetectionKey('hello world', 'en')
      expect(a.equals(b)).toBe(true)
    })
  })

  describe('runDetection', () => {
    it('returns declared source when declaredLanguage is provided', async () => {
      const result = await runDetectionForTest('some text', 'en')
      expect(result.source).toBe('declared')
      expect(result.linguaRsDetectedLanguage).toBe('en')
      expect(result.results).toMatchObject({ source: 'declared', language: 'en' })
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('returns none source for empty/whitespace text with no declared language', async () => {
      const result = await runDetectionForTest('   ', null)
      expect(result.source).toBe('none')
      expect(result.linguaRsDetectedLanguage).toBeNull()
      expect(result.results).toMatchObject({ source: 'none' })
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('returns none source for empty string', async () => {
      const result = await runDetectionForTest('', undefined)
      expect(result.source).toBe('none')
      expect(result.linguaRsDetectedLanguage).toBeNull()
      expect(mockDetectLanguage).not.toHaveBeenCalled()
    })

    it('calls lingua detector for non-empty text with no declared language', async () => {
      mockDetectLanguage.mockResolvedValueOnce({
        detector: 'lingua',
        detectorModelVersion: '1.0.0',
        languages: [{ iso6391: 'de', iso6393: 'deu', confidence: 0.95 }],
      })

      const result = await runDetectionForTest('Guten Morgen', null)
      expect(result.source).toBe('lingua')
      expect(result.linguaRsDetectedLanguage).toBe('de')
      expect(result.results).toMatchObject({ source: 'lingua', detector: 'lingua' })
      expect(mockDetectLanguage).toHaveBeenCalledOnce()
    })

    it('returns null top language when lingua returns empty languages array', async () => {
      mockDetectLanguage.mockResolvedValueOnce({
        detector: 'lingua',
        detectorModelVersion: 'unavailable',
        languages: [],
      })

      const result = await runDetectionForTest('some text here', null)
      expect(result.source).toBe('lingua')
      expect(result.linguaRsDetectedLanguage).toBeNull()
    })

    it('contentSha256 is the sha256 of the text', async () => {
      mockDetectLanguage.mockResolvedValueOnce({
        detector: 'lingua',
        detectorModelVersion: '1.0.0',
        languages: [{ iso6391: 'en', iso6393: 'eng', confidence: 0.9 }],
      })

      const text = 'Hello world'
      const result = await runDetectionForTest(text, null)
      const expected = computeContentSha256(text)
      expect(result.contentSha256.equals(expected)).toBe(true)
    })
  })

  describe('runDetectionMany', () => {
    it('rejects an incomplete detector result', async () => {
      const sparseResults = new Array<Awaited<ReturnType<typeof mockDetectLanguageMany>>[number]>(1)
      mockDetectLanguageMany.mockResolvedValueOnce(sparseResults)

      await expect(
        runDetectionManyForTest([{ text: 'Hello world', declaredLanguage: null }]),
      ).rejects.toThrow('Language detector returned no result for input at index 0')
    })

    it('rejects an incomplete final output array', async () => {
      const firstInput = { text: 'Hello world', declaredLanguage: 'en' }
      const inputs = [firstInput, { text: 'Bonjour monde', declaredLanguage: 'fr' }]
      Object.defineProperty(inputs, 0, {
        get() {
          inputs.length = 1
          return firstInput
        },
      })

      await expect(runDetectionManyForTest(inputs)).rejects.toThrow(
        'Language detection did not produce a result for input at index 1',
      )
    })

    it('resolves declared languages synchronously without calling detector', async () => {
      const inputs = [
        { text: 'Hello world', declaredLanguage: 'en' },
        { text: 'Bonjour monde', declaredLanguage: 'fr' },
      ]
      const results = await runDetectionManyForTest(inputs)
      expect(results).toHaveLength(2)
      expect(results[0]!.source).toBe('declared')
      expect(results[0]!.linguaRsDetectedLanguage).toBe('en')
      expect(results[1]!.source).toBe('declared')
      expect(results[1]!.linguaRsDetectedLanguage).toBe('fr')
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()
    })

    it('resolves empty texts synchronously without calling detector', async () => {
      const inputs = [
        { text: '   ', declaredLanguage: null },
        { text: '', declaredLanguage: null },
      ]
      const results = await runDetectionManyForTest(inputs)
      expect(results).toHaveLength(2)
      expect(results[0]!.source).toBe('none')
      expect(results[1]!.source).toBe('none')
      expect(mockDetectLanguageMany).not.toHaveBeenCalled()
    })

    it('calls detectLanguageMany once for all lingua-needing texts', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([
        {
          detector: 'lingua',
          detectorModelVersion: '1.0.0',
          languages: [{ iso6391: 'en', iso6393: 'eng', confidence: 0.98 }],
        },
        {
          detector: 'lingua',
          detectorModelVersion: '1.0.0',
          languages: [{ iso6391: 'de', iso6393: 'deu', confidence: 0.97 }],
        },
      ])

      const inputs = [
        { text: 'Hello world', declaredLanguage: null },
        { text: 'Hallo Welt', declaredLanguage: null },
      ]
      const results = await runDetectionManyForTest(inputs)
      expect(mockDetectLanguageMany).toHaveBeenCalledOnce()
      expect(results).toHaveLength(2)
      expect(results[0]!.source).toBe('lingua')
      expect(results[0]!.linguaRsDetectedLanguage).toBe('en')
      expect(results[1]!.source).toBe('lingua')
      expect(results[1]!.linguaRsDetectedLanguage).toBe('de')
    })

    it('rejects when the detector returns fewer results than requested', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([])

      await expect(
        runDetectionManyForTest([{ text: 'Hello world', declaredLanguage: null }]),
      ).rejects.toThrow('Language detector returned 0 results for 1 input')
    })

    it('mixes declared, empty, and lingua results in correct order', async () => {
      mockDetectLanguageMany.mockResolvedValueOnce([
        {
          detector: 'lingua',
          detectorModelVersion: '1.0.0',
          languages: [{ iso6391: 'ja', iso6393: 'jpn', confidence: 0.92 }],
        },
      ])

      const inputs = [
        { text: 'Hello', declaredLanguage: 'en' }, // declared → index 0
        { text: '   ', declaredLanguage: null }, // empty → index 1
        { text: 'こんにちは', declaredLanguage: null }, // lingua → index 2
      ]
      const results = await runDetectionManyForTest(inputs)
      expect(results).toHaveLength(3)
      expect(results[0]!.source).toBe('declared')
      expect(results[0]!.linguaRsDetectedLanguage).toBe('en')
      expect(results[1]!.source).toBe('none')
      expect(results[1]!.linguaRsDetectedLanguage).toBeNull()
      expect(results[2]!.source).toBe('lingua')
      expect(results[2]!.linguaRsDetectedLanguage).toBe('ja')
      // Only 1 text needed lingua detection
      expect(mockDetectLanguageMany).toHaveBeenCalledOnce()
    })
  })
})
