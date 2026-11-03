/**
 * Covers runDetection / runDetectionMany behavior that the real lingua-rs addon
 * cannot produce: an empty language list and malformed batch results. The addon
 * is stubbed at the package boundary, the same way detector.no-data.mock.test.mts
 * does it, and detect.mts runs unmodified on top of it.
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'

const detectLanguageMock = vi.fn<typeof import('lingua-rs').detectLanguage>()
const detectLanguageManyMock = vi.fn<typeof import('lingua-rs').detectLanguageMany>()

vi.resetModules()
vi.doMock<typeof import('lingua-rs')>(import('lingua-rs'), () => ({
  detectLanguage: detectLanguageMock,
  detectLanguageMany: detectLanguageManyMock,
}))

const { runDetection, runDetectionMany } = await import('../detect.mts')

function linguaResult(iso6391: string, iso6393: string) {
  return {
    detector: 'lingua',
    detectorModelVersion: '1.0.0',
    languages: [{ iso6391, iso6393, confidence: 0.9 }],
  }
}

describe('detect with a stubbed lingua-rs addon', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns a null top language when the addon returns an empty languages array', async () => {
    detectLanguageMock.mockResolvedValueOnce({
      detector: 'lingua',
      detectorModelVersion: 'unavailable',
      languages: [],
    })

    const result = await runDetection('some text here', null)

    expect(result.source).toBe('lingua')
    expect(result.linguaRsDetectedLanguage).toBeNull()
    expect(detectLanguageMock).toHaveBeenCalledExactlyOnceWith(
      Buffer.from('some text here', 'utf8'),
      undefined,
    )
  })

  it('sends every text needing detection to the addon in one batch call', async () => {
    detectLanguageManyMock.mockResolvedValueOnce([
      linguaResult('ja', 'jpn'),
      linguaResult('de', 'deu'),
    ])

    const results = await runDetectionMany([
      { text: 'Hello', declaredLanguage: 'en' },
      { text: 'こんにちは', declaredLanguage: null },
      { text: '   ', declaredLanguage: null },
      { text: 'Hallo Welt', declaredLanguage: null },
    ])

    expect(detectLanguageManyMock).toHaveBeenCalledExactlyOnceWith(
      [Buffer.from('こんにちは', 'utf8'), Buffer.from('Hallo Welt', 'utf8')],
      undefined,
    )
    expect(results.map(r => [r.source, r.linguaRsDetectedLanguage])).toEqual([
      ['declared', 'en'],
      ['lingua', 'ja'],
      ['none', null],
      ['lingua', 'de'],
    ])
  })

  it('rejects an incomplete addon result', async () => {
    detectLanguageManyMock.mockResolvedValueOnce(
      new Array<Awaited<ReturnType<typeof detectLanguageManyMock>>[number]>(1),
    )

    await expect(
      runDetectionMany([{ text: 'Hello world', declaredLanguage: null }]),
    ).rejects.toThrow('Language detector returned no result for input at index 0')
  })

  it('rejects when the addon returns fewer results than requested', async () => {
    detectLanguageManyMock.mockResolvedValueOnce([])

    await expect(
      runDetectionMany([{ text: 'Hello world', declaredLanguage: null }]),
    ).rejects.toThrow('Language detector returned 0 results for 1 input')
  })
})
