import { createHash } from 'node:crypto'
import {
  detectLanguage as linguaDetect,
  detectLanguageMany as linguaDetectMany,
  type DetectOptions,
} from './detector.mts'

type DetectorDependencies = {
  detectLanguage: typeof linguaDetect
  detectLanguageMany: typeof linguaDetectMany
}

export interface DetectionOutput {
  linguaRsDetectedLanguage: string | null
  contentSha256: Buffer
  results: object
  source: 'declared' | 'lingua' | 'none'
}

export function computeContentSha256(text: string): Buffer {
  return Buffer.from(createHash('sha256').update(text, 'utf8').digest())
}

/**
 * Idempotency key that includes both the text AND the declared language so that
 * changing only the declared language (e.g. author sets posts.declared_language) also
 * triggers re-detection even when the body text is unchanged.
 */
export function computeDetectionKey(text: string, declaredLanguage: string | null): Buffer {
  return computeContentSha256(`${text}\0${declaredLanguage ?? ''}`)
}

export async function runDetection(
  text: string,
  declaredLanguage: string | null | undefined,
  opts?: DetectOptions,
  dependencies?: Partial<DetectorDependencies>,
): Promise<DetectionOutput> {
  const contentSha256 = computeContentSha256(text)
  if (declaredLanguage) {
    return {
      linguaRsDetectedLanguage: declaredLanguage,
      contentSha256,
      results: { source: 'declared', language: declaredLanguage },
      source: 'declared',
    }
  }
  if (!text.trim()) {
    return {
      linguaRsDetectedLanguage: null,
      contentSha256,
      results: { source: 'none' },
      source: 'none',
    }
  }
  const detectLanguage = dependencies?.detectLanguage ?? linguaDetect
  const result = await detectLanguage(Buffer.from(text, 'utf8'), opts)
  const topLang = result.languages[0]?.iso6391 ?? null
  return {
    linguaRsDetectedLanguage: topLang,
    contentSha256,
    results: { ...result, source: 'lingua' },
    source: 'lingua',
  }
}

export interface DetectionInput {
  text: string
  declaredLanguage?: string | null
}

/**
 * Batch variant — resolves declared languages synchronously, then calls
 * detectLanguageMany once for all remaining texts (one libuv thread call).
 */
export async function runDetectionMany(
  inputs: DetectionInput[],
  opts?: DetectOptions,
  dependencies?: Partial<DetectorDependencies>,
): Promise<DetectionOutput[]> {
  const results: Array<DetectionOutput | undefined> = new Array(inputs.length)
  const needDetection: number[] = []

  // Pass 1: resolve declared languages and empty texts synchronously
  for (let i = 0; i < inputs.length; i++) {
    const { text, declaredLanguage } = inputs[i]!
    const contentSha256 = computeContentSha256(text)
    if (declaredLanguage) {
      results[i] = {
        linguaRsDetectedLanguage: declaredLanguage,
        contentSha256,
        results: { source: 'declared', language: declaredLanguage },
        source: 'declared',
      }
    } else if (!text.trim()) {
      results[i] = {
        linguaRsDetectedLanguage: null,
        contentSha256,
        results: { source: 'none' },
        source: 'none',
      }
    } else {
      needDetection.push(i)
    }
  }

  // Pass 2: batch detect all remaining texts in one NAPI call
  if (needDetection.length > 0) {
    const buffers = needDetection.map(i => Buffer.from(inputs[i]!.text, 'utf8'))
    const detectLanguageMany = dependencies?.detectLanguageMany ?? linguaDetectMany
    const detectionResults = await detectLanguageMany(buffers, opts)
    if (detectionResults.length !== needDetection.length) {
      throw new Error(
        `Language detector returned ${detectionResults.length} results for ${needDetection.length} input${needDetection.length === 1 ? '' : 's'}`,
      )
    }
    for (let j = 0; j < needDetection.length; j++) {
      const i = needDetection[j]!
      const result = detectionResults[j]
      if (result === undefined) {
        throw new Error(`Language detector returned no result for input at index ${i}`)
      }
      const contentSha256 = computeContentSha256(inputs[i]!.text)
      results[i] = {
        linguaRsDetectedLanguage: result.languages[0]?.iso6391 ?? null,
        contentSha256,
        results: { ...result, source: 'lingua' },
        source: 'lingua',
      }
    }
  }

  return Array.from(results, (result, index) => {
    if (result === undefined) {
      throw new Error(`Language detection did not produce a result for input at index ${index}`)
    }
    return result
  })
}
