import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { runWorkerIoCliSmoke } from './image-smoke.mts'

const execFileAsync = promisify(execFile)
const cli = fileURLToPath(new URL('./image-smoke.mts', import.meta.url))

describe('worker-io cli smoke', () => {
  it('sorts and comms through the wrapper when TMPDIR is writable', async () => {
    const dir = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'worker-io-smoke-'))
    try {
      vi.stubEnv('TMPDIR', dir)
      await expect(runWorkerIoCliSmoke()).resolves.toBeUndefined()
      expect(await readdir(dir)).toEqual([])
    } finally {
      vi.unstubAllEnvs()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses to run without TMPDIR', async () => {
    const env = { ...process.env }
    delete env.TMPDIR
    await expect(execFileAsync(process.execPath, [cli], { env })).rejects.toMatchObject({
      stderr: expect.stringContaining('TMPDIR must point at writable ephemeral storage'),
    })
  })

  it('fails when TMPDIR does not exist', async () => {
    const dir = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'worker-io-smoke-'))
    try {
      await expect(
        execFileAsync(process.execPath, [cli], {
          env: { ...process.env, TMPDIR: join(dir, 'missing') },
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining('ENOENT') })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
