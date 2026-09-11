import { formatReferenceKey } from './closing-refs.mts'

const NON_CLOSING_REF_RE =
  /\b(?:refs?|part\s+of):?[ \t]+(?:(?<ownerRepo>[\w.-]+\/[\w.-]+))?#(?<number>\d+)\b/gi
const RELATED_ISSUES_RE = /^##\s+Related\s+issues\s*$/im

// Duplicated from validate.mts rather than imported: a shared module for one 3-line helper would
// trigger require-test-per-subdir for no real reuse, and importing validate.mts here risks reading
// as a coupling this module doesn't have.
/** Split body by top-level headings and return the Related issues section content. */
function extractRelatedIssuesSection(body: string): string {
  const sections = body.split(/^(?=##\s)/m)
  return sections.find(s => RELATED_ISSUES_RE.test(s.split('\n')[0])) ?? ''
}

/**
 * Only a "## Related issues" disposition counts — an incidental `Refs #N` in a fenced example or
 * unrelated section must not silently satisfy the audit. Returns reference keys (`#N` or
 * `owner/repo#N`, the same format `closing-refs.mts`'s `formatReferenceKey` produces) rather than
 * bare numbers, so a `Refs owner/other-repo#42` cannot disposition a same-numbered LOCAL sibling
 * `#42` — callers match by key, not by coincidental number.
 */
export function parseNonClosingRefs(body: string): Set<string> {
  const keys = new Set<string>()
  for (const match of extractRelatedIssuesSection(body).matchAll(NON_CLOSING_REF_RE)) {
    const number = Number(match.groups?.number)
    if (!Number.isSafeInteger(number)) continue
    const ownerRepo = match.groups?.ownerRepo?.toLowerCase()
    const [owner, repo] = ownerRepo?.split('/') ?? [undefined, undefined]
    keys.add(formatReferenceKey({ number, owner, repo }))
  }
  return keys
}
