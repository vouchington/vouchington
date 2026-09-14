import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const devDir = fileURLToPath(new URL('.', import.meta.url))

async function makeCheckout() {
  const root = await mkdtemp(join(tmpdir(), 'voucha-worktree-port-check-'))
  await mkdir(join(root, '.git'))
  await mkdir(join(root, 'dev', 'lib'), { recursive: true })
  for (const relativePath of [
    'check-worktree-ports',
    'lib/worktree-resource-env.sh',
    'lib/refuse-on-main.sh',
    'lib/db-name-from-url.sh',
  ]) {
    const target = join(root, 'dev', relativePath)
    await writeFile(target, await readFile(join(devDir, relativePath), 'utf8'))
  }
  await chmod(join(root, 'dev', 'check-worktree-ports'), 0o755)
  return root
}

async function run(root: string, tempPath: string) {
  try {
    await execFileAsync('bash', [join(root, 'dev', 'check-worktree-ports')], {
      cwd: root,
      env: { ...process.env, TMPDIR: tempPath, WORKER_PORT: '8787' },
    })
    return 0
  } catch (error) {
    return (error as { code?: number }).code ?? -1
  }
}

describe('check-worktree-ports', () => {
  it('allows the fixed entrypoint port in the protected main checkout', async () => {
    const root = await makeCheckout()
    const separateTemp = await mkdtemp(join(tmpdir(), 'voucha-separate-tmp-'))
    try {
      expect(await run(root, separateTemp)).toBe(0)
    } finally {
      await Promise.all([root, separateTemp].map(dir => rm(dir, { force: true, recursive: true })))
    }
  })

  it('rejects the fixed entrypoint port in a disposable full clone', async () => {
    const root = await makeCheckout()
    try {
      expect(await run(root, tmpdir())).toBe(1)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
