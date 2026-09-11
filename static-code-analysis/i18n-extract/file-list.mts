import { spawn } from 'node:child_process'
import { gitEnv } from 'vouchington-tooling/shared-context'

const EXCLUDED_BASENAMES = new Set(['public-nav.ts', 'product.ts', 'nav-intents.ts'])

/** Files this codemod must never touch: nav/chrome wiring (basename denylist + `nav.*` files),
 * test/story files (not real UI source), and the Storybook design-system gallery (dev-only tooling
 * never shown to a real user — extracting it would translate strings no one reads and bloat the
 * catalog). Scoping enumeration to `.tsx` already excludes the denylisted `.ts` config files, but
 * the explicit check stays as defense in depth. */
function isExcluded(relativePath: string): boolean {
  const basename = relativePath.split('/').pop() ?? ''
  if (EXCLUDED_BASENAMES.has(basename)) return true
  if (basename.startsWith('nav.')) return true
  if (/\.(test|spec|stories)\./.test(basename)) return true
  if (relativePath.includes('/__tests__/')) return true
  if (relativePath.startsWith('web/storybook/')) return true
  return false
}

/** Lists git-tracked `.tsx` files under the given repo-relative directories/pathspecs. */
export async function listCandidateFiles(repoRoot: string, pathspecs: string[]): Promise<string[]> {
  const output = await new Promise<string>((resolve, reject) => {
    const proc = spawn('git', ['-C', repoRoot, 'ls-files', '-z', '--', ...pathspecs], {
      env: gitEnv(),
      stdio: 'pipe',
    })
    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    proc.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(`git ls-files failed (exit ${code}): ${Buffer.concat(errChunks).toString()}`),
        )
        return
      }
      resolve(Buffer.concat(chunks).toString())
    })
  })

  return output
    .split('\0')
    .filter(Boolean)
    .filter(path => path.endsWith('.tsx'))
    .filter(path => !isExcluded(path))
}
