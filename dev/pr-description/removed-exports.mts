export function parseRemovedExports(block: string, path: string): RemovedSurface[] {
  const removed = new Set<string>()
  const added = new Set<string>()
  let inNamedBlock = false
  for (const line of block.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    const sign = line.startsWith('-') ? '-' : line.startsWith('+') ? '+' : ''
    const content = (sign === '' ? line : line.slice(1)).trim()
    if (inNamedBlock) {
      if (content.startsWith('}')) inNamedBlock = false
      else if (sign !== '') addNamedExportNames(content, sign === '-' ? removed : added)
      continue
    }
    if (EXPORT_NAMED_OPEN_RE.test(content)) {
      inNamedBlock = true
      continue
    }
    if (sign !== '') collectExportNames(content, sign === '-' ? removed : added)
  }
  const surfaces: RemovedSurface[] = []
  for (const name of removed) {
    if (!added.has(name)) surfaces.push({ name, path, type: 'removed-export' })
  }
  return surfaces
}

export function addNamedExportNames(raw: string, into: Set<string>): void {
  for (const part of raw.split(',')) {
    const name = part
      .trim()
      .split(/\s+as\s+/)
      .pop()
      ?.trim()
    if (name) into.add(name)
  }
}

export function collectExportNames(content: string, into: Set<string>): void {
  const trimmed = content.trim()
  const star = EXPORT_STAR_RE.exec(trimmed)?.groups?.spec
  if (star !== undefined) {
    into.add((star.split('/').pop() ?? star).replace(/\.[mc]?[jt]sx?$/, ''))
    return
  }
  const named = EXPORT_NAMED_RE.exec(trimmed)?.groups?.names
  if (named !== undefined) {
    addNamedExportNames(named, into)
    return
  }
  const declared = EXPORT_DECL_RE.exec(trimmed)?.groups?.name
  if (declared !== undefined) into.add(declared)
}

const UBIQUITY_STOPLIST = new Set(
  'base common config constants core helper helpers index main shared types util utils'.split(' '),
)

const TYPE_PRIORITY: Record<RemovedSurface['type'], number> = {
  'deleted-file': 0,
  'removed-export': 1,
  'removed-route': 2,
  'removed-script': 3,
}

// Bounds and orders the search vocabulary as quoted phrase terms (a quoted path outranked the bare
// filename against the live API), dropping sub-4-char/stoplist terms; excluded terms land in `dropped`.
