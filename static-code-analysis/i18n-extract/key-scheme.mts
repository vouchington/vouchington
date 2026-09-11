import { createHash } from 'node:crypto'
import { basename, dirname } from 'node:path'

/**
 * Collapses all whitespace runs to a single space and trims. Applied before both the catalog
 * value and the hash input, so a string with different incidental indentation/newlines (e.g. a
 * multi-line JSX text node) always yields the same key and the same stored value.
 */
export function normalizeText(rawText: string): string {
  return rawText.replace(/\s+/g, ' ').trim()
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1).toLowerCase()
}

function toCamelCase(words: string[], fallback: string): string {
  if (words.length === 0) return fallback
  return words.map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word))).join('')
}

/** Splits arbitrary text (kebab-case, snake_case, or prose) into camelCase-safe words. */
function splitWords(segment: string): string[] {
  return segment
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Derives the `extracted.<parentDir>.<fileBase>` namespace prefix from a repo-relative file
 * path. Deliberately lossy/non-injective (e.g. two differently-named parent dirs could in
 * theory camelCase-collide) — collision-freedom is guaranteed by the per-string content hash
 * appended in {@link computeKey}, not by this namespace derivation.
 */
export function deriveNamespace(filePath: string): string {
  const fileBase = basename(filePath).replace(/\.(tsx|ts|mts)$/, '')
  const parentDir = basename(dirname(filePath))
  const parentSegment = toCamelCase(splitWords(parentDir), 'dir')
  const fileSegment = toCamelCase(splitWords(fileBase), 'file')
  return `extracted.${parentSegment}.${fileSegment}`
}

/** Builds a camelCase slug from the first few significant words of the normalized text. */
export function slugify(normalizedText: string): string {
  const words = splitWords(normalizedText).slice(0, 6)
  return toCamelCase(words, 'text')
}

/**
 * First 8 hex characters of the sha256 of the exact normalized text. Appended unconditionally
 * (not only on detected collisions) so the key is a pure function of (namespace, text) with no
 * dependency on run scope, ordering, or a registry of "other strings already seen" — the
 * property that keeps sample-directory keys byte-identical when later swept up in a full run.
 */
export function hash8(normalizedText: string): string {
  return createHash('sha256').update(normalizedText, 'utf8').digest('hex').slice(0, 8)
}

export interface ExtractedKey {
  /** Full dot path, e.g. `extracted.comments.commentNodeEditForm.failedToSaveComment_a3f9c1d2`. */
  fullKey: string
  /** Whitespace-normalized text — the catalog value and the hash input. */
  normalizedText: string
}

/**
 * Computes the full extracted-catalog key for a string found at `filePath`. A pure function of
 * (filePath, rawText): no dependency on any other string processed in the same run.
 */
export function computeKey(filePath: string, rawText: string): ExtractedKey {
  const normalizedText = normalizeText(rawText)
  const namespace = deriveNamespace(filePath)
  const slug = slugify(normalizedText)
  return { fullKey: `${namespace}.${slug}_${hash8(normalizedText)}`, normalizedText }
}
