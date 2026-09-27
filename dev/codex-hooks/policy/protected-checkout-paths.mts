import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const REBASE_ONTO_MAIN = './dev/rebase-onto-main'

const PATHSPEC_FILE = fileURLToPath(new URL('../../protected-checkout-paths.txt', import.meta.url))

export function protectedCheckoutPathspecFile(): string {
  return PATHSPEC_FILE
}

export function isProtectedCheckoutPath(relativePath: string): boolean {
  const path = normalizeCheckoutPath(relativePath)
  return pathspecSource().patterns.some(pattern => pattern.test(path))
}

/** A checkout pathspec git may expand onto a protected file, such as `.` or `.claude`. */
export function checkoutPathspecIsBroad(relativePath: string): boolean {
  const path = normalizeCheckoutPath(relativePath).replace(/\/+$/, '')
  if (path === '' || path === '.' || /[*?[]/.test(path)) return true
  return pathspecSource().globs.some(glob => globCoversDirectory(glob, path))
}

export function protectedCheckoutReason(paths: readonly string[]): string {
  const listed = paths.slice(0, 5).join(', ')
  const pathText = listed === '' ? 'a protected path' : listed
  return (
    `Refusing to update the worktree because ${pathText} would be replaced. ` +
    'A sandboxed checkout can stop halfway and leave the tree half-updated. ' +
    `Run ${REBASE_ONTO_MAIN} with SANDBOX_RUNTIME and CURSOR_SANDBOX unset. ` +
    'Do not use ours/theirs strategy options. git rebase --abort stays allowed.'
  )
}

export function staleFetchCheckoutReason(): string {
  return (
    'Refusing to fetch and update the worktree in one command. ' +
    `Run ${REBASE_ONTO_MAIN} so the protected-path check sees the fetched main. ` +
    'A sandboxed checkout can leave the tree half-updated.'
  )
}

let cachedSource: { globs: string[]; patterns: RegExp[] } | undefined

function pathspecSource(): { globs: string[]; patterns: RegExp[] } {
  if (cachedSource !== undefined) return cachedSource
  const globs = readFileSync(PATHSPEC_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(line => (line.startsWith(':(glob)') ? line.slice(':(glob)'.length) : line))
  cachedSource = { globs, patterns: globs.map(glob => pathspecToRegExp(glob)) }
  return cachedSource
}

function normalizeCheckoutPath(relativePath: string): string {
  return relativePath.replace(/^\.?\//, '').replaceAll('\\', '/')
}

function globCoversDirectory(glob: string, path: string): boolean {
  const magicAt = glob.search(/[*?[]/)
  const literal = (magicAt < 0 ? glob : glob.slice(0, magicAt)).replace(/\/+$/, '')
  if (literal !== '' && literal.startsWith(`${path}/`)) return true
  if (magicAt >= 0 && literal !== '' && (path === literal || path.startsWith(`${literal}/`))) {
    return true
  }
  const last = path.slice(path.lastIndexOf('/') + 1)
  return magicAt === 0 && glob.startsWith('**') && !last.includes('.')
}

function pathspecToRegExp(glob: string): RegExp {
  const expression = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '§')
    .replaceAll('*', '[^/]*')
    .replaceAll('§', '.*')
  return new RegExp(`^${expression}$`)
}
