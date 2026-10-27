import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('worker-io image cli smoke', () => {
  it('runs sort -u and comm through the wrapper', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'worker-io-cli-smoke-'))
    try {
      await expect(
        execFileAsync(process.execPath, ['backend/modules/child-process/image-smoke.mts'], {
          env: { ...process.env, TMPDIR: dir },
        }),
      ).resolves.toMatchObject({ stdout: '' })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
