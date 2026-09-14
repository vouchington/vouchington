import path from 'node:path'
import { listCandidateFiles } from './file-list.mts'

const ROOT_NEXT_STATE_FILES = new Set([
  'error.ts',
  'error.tsx',
  'forbidden.tsx',
  'global-error.tsx',
  'not-found.tsx',
  'unauthorized.tsx',
])

/** Root Next status pages and the eagerly mounted Navbar can render for any route state. */
export async function globalChromeFiles(
  repoRoot: string,
  appRoot: string,
  navbar: string,
): Promise<string[]> {
  return (await listCandidateFiles(repoRoot, [appRoot, navbar], ['.ts', '.tsx']))
    .filter(
      file =>
        file === navbar ||
        (path.dirname(file) === appRoot && ROOT_NEXT_STATE_FILES.has(path.basename(file))),
    )
    .toSorted()
}
