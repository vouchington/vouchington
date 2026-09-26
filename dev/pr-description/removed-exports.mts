export type RemovedSurface =
  | { path: string; type: 'deleted-file' }
  | { name: string; path: string; type: 'removed-export' }
  | { path: string; route: string; type: 'removed-route' }
  | { name: string; path: string; type: 'removed-script' }

const EXPORT_STAR_RE = /^export\s+(?:type\s+)?\*\s+from\s+['"](?<spec>[^'"]+)['"]/
const EXPORT_NAMED_RE = /^export\s+(?:type\s+)?\{\s*(?<names>[^}]+)\}/
const EXPORT_NAMED_OPEN_RE = /^export\s*(?:type\s+)?\{\s*$/
const EXPORT_DECL_RE =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(?<name>[A-Za-z_$][\w$]*)/

// Tracks a multiline `export { ... }` block; entry is sign-agnostic since the opener may be context.
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
