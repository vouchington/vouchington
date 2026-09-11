import type { DetectOptions, LinguaDetectionResult } from 'lingua-rs'

/**
 * Thin wrapper around the lingua-rs NAPI addon.
 * This file is the single import point so tests can mock it easily.
 *
 * lingua-rs is loaded via a dynamic import. If the addon is unavailable (e.g.
 * native binary not yet published for this platform), detection THROWS rather
 * than returning an empty result — so the worker job fails and retries, and the
 * row keeps `lingua_rs_input_sha256 IS NULL` for the backfill to pick up once
 * binaries are present. Returning a fake empty result would set input_sha256 and
 * permanently short-circuit detection for that content.
 */

export type { DetectOptions, LinguaDetectionResult }

type LinguaModule = Pick<typeof import('lingua-rs'), 'detectLanguage' | 'detectLanguageMany'>

let cachedMod: LinguaModule | null | undefined

async function requireLinguaMod(): Promise<LinguaModule> {
  if (cachedMod === undefined) {
    const mod = await import('lingua-rs').catch(() => null)
    cachedMod = mod
  }
  if (!cachedMod) {
    // Throw (not a fake empty result) so the job retries and the row's
    // lingua_rs_input_sha256 stays NULL for the backfill once binaries exist.
    throw new Error('lingua-rs addon is unavailable; language detection cannot run')
  }
  return cachedMod
}

export async function detectLanguage(
  input: Buffer,
  options?: DetectOptions,
): Promise<LinguaDetectionResult> {
  const mod = await requireLinguaMod()
  return mod.detectLanguage(input, options)
}

/** Batch variant — calls detectLanguageMany for efficiency when processing many texts. */
export async function detectLanguageMany(
  inputs: Buffer[],
  options?: DetectOptions,
): Promise<LinguaDetectionResult[]> {
  const mod = await requireLinguaMod()
  return mod.detectLanguageMany(inputs, options)
}
