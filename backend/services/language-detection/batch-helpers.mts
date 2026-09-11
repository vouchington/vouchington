import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { computeDetectionKey, runDetectionMany, type DetectionInput } from './detect.mts'
import { detectLanguageMany } from './detector.mts'
import type { SQLStatement } from 'sql-template-strings'

export type BatchRow = {
  id: string
  text: string
  declaredLanguage: string | null
  inputSha256: Buffer | null
  guard?: SQLStatement
}

export type UpdateFn = (
  id: string,
  detectedLanguage: string | null,
  contentSha256: Buffer,
  inputSha256: Buffer,
  resultsJson: string,
  row: BatchRow,
) => Promise<unknown>

type BatchDependencies = {
  detectLanguageMany: typeof detectLanguageMany
}

export async function runBatch(
  rows: BatchRow[],
  updateFn: UpdateFn,
  dependencies?: Partial<BatchDependencies>,
): Promise<{ updated: number }> {
  // Use the declared language in the key so changing a declared language triggers re-detection
  // even when text hasn't changed — matches the single-entity computeDetectionKey convention.
  const pending = rows.filter(row => {
    const normalized = normalizeContentLanguageTag(row.declaredLanguage)
    const key = computeDetectionKey(row.text, normalized)
    return row.inputSha256 == null || !row.inputSha256.equals(key)
  })
  if (pending.length === 0) return { updated: 0 }

  const inputs: DetectionInput[] = pending.map(r => ({
    text: r.text,
    declaredLanguage: normalizeContentLanguageTag(r.declaredLanguage),
  }))
  const outputs = await runDetectionMany(inputs, undefined, dependencies)

  await Promise.all(
    pending.map((row, i) => {
      const output = outputs[i]!
      const normalized = normalizeContentLanguageTag(row.declaredLanguage)
      const inputSha256 = computeDetectionKey(row.text, normalized)
      return updateFn(
        row.id,
        output.linguaRsDetectedLanguage,
        output.contentSha256,
        inputSha256,
        JSON.stringify(output.results),
        row,
      )
    }),
  )
  return { updated: pending.length }
}
