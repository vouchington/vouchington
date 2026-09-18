import type { ClassifyRule } from 'pr-shepherd/classify'

/**
 * Sourcery has no access to this repository while it is private, so it answers every review
 * request with the same upsell instead of a review. Left unsuppressed, that one message makes
 * Shepherd return `FIX_CODE` on every poll of every PR, forever.
 *
 * Matched on the upsell body rather than on the author alone: once this repository is public,
 * Sourcery gains access and its reviews become real feedback that must not be discarded silently.
 */
const rule: ClassifyRule = item => {
  if (item.author !== 'sourcery-ai' && item.author !== 'sourcery-ai[bot]') return null
  // A real Sourcery review opens with a Markdown heading ("Reviewer's Guide", "Summary by
  // Sourcery"). The upsell carries none, so a heading means this is genuine feedback that merely
  // quotes the phrase.
  if (/^#{1,6}\s/m.test(item.body)) return null
  if (!/does not have access to Sourcery/i.test(item.body)) return null
  return {
    autoResolve: true,
    suppress: true,
    reason: 'sourcery no-access upsell',
  }
}

export default rule
