import { execFileSync } from 'node:child_process'

// `git ls-files` output outgrew Node's default 1 MiB `maxBuffer` (spawnSync git ENOBUFS), so every
// synchronous listing passes this limit; 4 MiB leaves headroom as the tracked-file list grows.
export const GIT_LS_FILES_MAX_BUFFER_BYTES = 4 * 1024 * 1024

/** Tracked paths under `cwd`, optionally narrowed to `pathspecs`, read past Node's default buffer. */
export function trackedFiles(cwd: string, pathspecs: readonly string[] = []): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd,
    encoding: 'utf8',
    maxBuffer: GIT_LS_FILES_MAX_BUFFER_BYTES,
  })
    .split('\0')
    .filter(Boolean)
}
