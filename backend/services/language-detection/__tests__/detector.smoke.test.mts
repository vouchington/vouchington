/**
 * Smoke test for the real lingua-rs native addon.
 *
 * This is intentionally NOT a mock test (*.test.mts, not *.mock.test.mts) so it
 * runs under the backend-data-stores vitest project on Linux CI with the real
 * platform binary. If lingua-rs is ever published without a compiled .node file
 * (as happened with 0.1.0 and 0.1.1), this test fails CI immediately instead of
 * silently breaking worker-cpu at runtime.
 *
 * No vi.mock — the whole point is to load the native addon.
 */
import { describe, it, expect } from 'vitest'

import { detectLanguage, detectLanguageMany } from '../detector.mts'

describe('detector smoke (real lingua-rs addon)', () => {
  it('detects English text', async () => {
    const result = await detectLanguage(
      Buffer.from('The quick brown fox jumps over the lazy dog', 'utf8'),
    )
    expect(result.detector).toBe('lingua')
    expect(typeof result.detectorModelVersion).toBe('string')
    expect(result.languages.length).toBeGreaterThan(0)
    expect(result.languages[0]?.iso6391).toBe('en')
    expect(result.languages[0]?.confidence).toBeGreaterThan(0)
  })

  it('detects German text (non-constant: different from English)', async () => {
    const result = await detectLanguage(
      Buffer.from(
        'Die Würde des Menschen ist unantastbar. Sie zu achten und zu schützen ist Verpflichtung aller staatlichen Gewalt.',
        'utf8',
      ),
    )
    expect(result.languages[0]?.iso6391).toBe('de')
  })

  it('detectLanguageMany returns one result per input', async () => {
    const inputs = [
      Buffer.from('The quick brown fox jumps over the lazy dog', 'utf8'),
      Buffer.from(
        'Die Würde des Menschen ist unantastbar. Sie zu achten und zu schützen ist Verpflichtung aller staatlichen Gewalt.',
        'utf8',
      ),
    ]
    const results = await detectLanguageMany(inputs)
    expect(results).toHaveLength(2)
    expect(results[0]?.languages[0]?.iso6391).toBe('en')
    expect(results[1]?.languages[0]?.iso6391).toBe('de')
  })
})
