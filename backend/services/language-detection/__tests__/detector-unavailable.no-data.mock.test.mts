/**
 * Covers the unavailable path of detector.mts: when the lingua-rs addon cannot
 * be imported (e.g. native binary not published for this platform), detection
 * must THROW rather than return a fake empty result — so the worker job retries
 * and the row's lingua_rs_input_sha256 stays NULL for the backfill.
 *
 * This needs its own file: detector.mts caches the resolved module at module
 * scope, so a fresh module (isolate: true) is required to exercise the null path.
 */
import { describe, it, expect, vi } from 'vitest'

// Make the dynamic `import('lingua-rs')` reject so getLinguaMod resolves to null.
vi.mock<typeof import('lingua-rs')>(import('lingua-rs'), () => {
  throw new Error('native binary unavailable')
})

import { detectLanguage, detectLanguageMany } from '../detector.mts'

describe('detector when lingua-rs is unavailable', () => {
  it('detectLanguage rejects instead of returning an empty result', async () => {
    await expect(detectLanguage(Buffer.from('hello', 'utf8'))).rejects.toThrow(/unavailable/)
  })

  it('detectLanguageMany rejects instead of returning empty results', async () => {
    await expect(detectLanguageMany([Buffer.from('hello', 'utf8')])).rejects.toThrow(/unavailable/)
  })
})
