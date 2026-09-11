/**
 * Idempotently splices rendered `Agent:`/`Device:`/`Worktree:` lines into a PR body immediately
 * after the `Workspace setup:` line. Existing values are preserved verbatim (backfill-only);
 * only missing keys are appended. Anchoring on `Workspace setup:` sidesteps fenced-code false
 * positives without needing a separate unfenced-line scan.
 */

const WORKSPACE_SETUP_ANCHOR_RE = /^\s*Workspace\s+setup\s*:/
const PROVENANCE_KEY_RE = /^\s*(Agent|Device|Worktree)\s*:/

type ProvenanceKey = 'Agent' | 'Device' | 'Worktree'
const PROVENANCE_KEYS: readonly ProvenanceKey[] = ['Agent', 'Device', 'Worktree']

function keyOf(line: string): ProvenanceKey | undefined {
  const match = PROVENANCE_KEY_RE.exec(line)
  return match ? (match[1] as ProvenanceKey) : undefined
}

/** Index of the *last* `Workspace setup:` line, or -1 if none exists. */
function findAnchorIndex(lines: string[]): number {
  let index = -1
  for (const [i, line] of lines.entries()) {
    if (WORKSPACE_SETUP_ANCHOR_RE.test(line)) index = i
  }
  return index
}

export function injectProvenance(body: string, lines: string[]): string {
  const bodyLines = body.split('\n')
  const rendered = new Map<ProvenanceKey, string>()
  for (const line of lines) {
    const key = keyOf(line)
    if (key) rendered.set(key, line)
  }

  const anchorIndex = findAnchorIndex(bodyLines)
  if (anchorIndex === -1) {
    const trimmed = bodyLines[bodyLines.length - 1] === '' ? bodyLines.slice(0, -1) : bodyLines
    return [...trimmed, ...lines].join('\n')
  }

  let blockEnd = anchorIndex + 1
  const present = new Set<ProvenanceKey>()
  while (blockEnd < bodyLines.length) {
    const key = keyOf(bodyLines[blockEnd])
    if (!key) break
    present.add(key)
    blockEnd++
  }

  const additions = PROVENANCE_KEYS.filter(key => !present.has(key))
    .map(key => rendered.get(key))
    .filter((line): line is string => line !== undefined)

  if (additions.length === 0) return body
  return [...bodyLines.slice(0, blockEnd), ...additions, ...bodyLines.slice(blockEnd)].join('\n')
}
