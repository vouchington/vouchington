import { formatReferenceKey } from './closing-refs.mts'
import { extractRelatedIssuesReferenceText } from './content-policy.mts'

const NON_CLOSING_REF_RE =
  /\b(?:refs?|part\s+of):?[ \t]+(?:(?<ownerRepo>[\w.-]+\/[\w.-]+))?#(?<number>\d+)\b/gi

/**
 * Only a "## Related issues" disposition counts — an incidental `Refs #N` in a fenced example or
 * unrelated section must not silently satisfy the audit. Returns reference keys (`#N` or
 * `owner/repo#N`, the same format `closing-refs.mts`'s `formatReferenceKey` produces) rather than
 * bare numbers, so a `Refs owner/other-repo#42` cannot disposition a same-numbered LOCAL sibling
 * `#42` — callers match by key, not by coincidental number.
 */
export function parseNonClosingRefs(body: string): Set<string> {
  const keys = new Set<string>()
  for (const match of extractRelatedIssuesReferenceText(body).matchAll(NON_CLOSING_REF_RE)) {
    const number = Number(match.groups?.number)
    if (!Number.isSafeInteger(number)) continue
    const ownerRepo = match.groups?.ownerRepo?.toLowerCase()
    const [owner, repo] = ownerRepo?.split('/') ?? [undefined, undefined]
    keys.add(formatReferenceKey({ number, owner, repo }))
  }
  return keys
}
