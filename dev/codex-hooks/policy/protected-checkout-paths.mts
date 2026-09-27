import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const REBASE_ONTO_MAIN = './dev/rebase-onto-main'

const PATHSPEC_FILE = fileURLToPath(new URL('../../protected-checkout-paths.txt', import.meta.url))

export function protectedCheckoutPathspecFile(): string {
  return PATHSPEC_FILE
}

export function isProtectedCheckoutPath(relativePath: string): boolean {
  const path = relativePath.replace(/^\.?\//, '').replaceAll('\\', '/')
  return pathspecPatterns().some(pattern => pattern.test(path))
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

let compiledPatterns: RegExp[] | undefined

function pathspecPatterns(): RegExp[] {
  compiledPatterns ??= readFileSync(PATHSPEC_FILE, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#'))
    .map(pathspecToRegExp)
  return compiledPatterns
}

function pathspecToRegExp(pathspec: string): RegExp {
  const glob = pathspec.startsWith(':(glob)') ? pathspec.slice(':(glob)'.length) : pathspec
  const expression = glob
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '§')
    .replaceAll('*', '[^/]*')
    .replaceAll('§', '.*')
  return new RegExp(`^${expression}$`)
}
