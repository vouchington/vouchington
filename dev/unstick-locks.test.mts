import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const devDir = fileURLToPath(new URL('.', import.meta.url))

async function makeRepo() {
  const repo = await mkdtemp(join(tmpdir(), 'voucha-unstick-locks-'))
  await execFileAsync('git', ['init', '-q', repo])
  await mkdir(join(repo, 'dev', 'lib'), { recursive: true })
  for (const relativePath of [
    'unstick-locks',
    'lib/refuse-on-main.sh',
    'lib/worktree-resource-env.sh',
    'lib/db-name-from-url.sh',
  ]) {
    const destination = join(repo, 'dev', relativePath)
    await writeFile(destination, await readFile(join(devDir, relativePath), 'utf8'))
  }
  return repo
}

describe('./dev/unstick-locks', () => {
  it('ignores the persistent reset lock file, which is not itself a held lock', async () => {
    const repo = await makeRepo()
    const home = await mkdtemp(join(tmpdir(), 'voucha-unstick-locks-home-'))
    try {
      const lockPath = join(repo, '.local', 'reset-worktree.lock')
      await mkdir(join(repo, '.local'), { recursive: true })
      await writeFile(lockPath, '')

      const result = await execFileAsync('bash', [join(repo, 'dev', 'unstick-locks')], {
        cwd: repo,
        env: { ...process.env, HOME: home },
      })

      expect(result.stdout).toContain('No stale locks found.')
      expect(await readFile(lockPath, 'utf8')).toBe('')
    } finally {
      await Promise.all([repo, home].map(dir => rm(dir, { force: true, recursive: true })))
    }
  })
})
