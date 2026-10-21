import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as wrapper from './index.mts'
import { runWorkerIoCliSmoke } from './image-smoke.mts'

describe('worker-io cli smoke', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sorts and comms through the wrapper when TMPDIR is writable', async () => {
    await withTmpdir(async () => {
      await expect(runWorkerIoCliSmoke()).resolves.toBeUndefined()
    })
  })

  it('refuses to run without TMPDIR', async () => {
    const previous = process.env.TMPDIR
    delete process.env.TMPDIR
    try {
      await expect(runWorkerIoCliSmoke()).rejects.toThrow(
        'TMPDIR must point at writable ephemeral storage',
      )
    } finally {
      restoreTmpdir(previous)
    }
  })

  it('reports a wrapper failure and a wrong sort or comm result', async () => {
    const run = vi.spyOn(wrapper, 'runCommand')
    await withTmpdir(async () => {
      run.mockRejectedValueOnce(
        new wrapper.CommandFailedError('/usr/bin/sort', {
          reason: 'exit',
          exitCode: 1,
          signal: null,
          stderr: Buffer.from('missing'),
        }),
      )
      await expect(runWorkerIoCliSmoke()).rejects.toThrow(/worker-io cli smoke failed \(exit\)/)

      run.mockImplementationOnce(async options => {
        options.stdout?.write('nope\n')
        return { stderr: Buffer.alloc(0) }
      })
      await expect(runWorkerIoCliSmoke()).rejects.toThrow(/sort -u returned/)

      run.mockImplementationOnce(async options => {
        options.stdout?.write('a\nb\n')
        return { stderr: Buffer.alloc(0) }
      })
      run.mockImplementationOnce(async options => {
        options.stdout?.write('z\n')
        return { stderr: Buffer.alloc(0) }
      })
      await expect(runWorkerIoCliSmoke()).rejects.toThrow(/comm -23 returned/)

      run.mockRejectedValueOnce(new Error('wrapper exploded'))
      await expect(runWorkerIoCliSmoke()).rejects.toThrow('wrapper exploded')
    })
    expect(run).toHaveBeenCalled()
  })
})

async function withTmpdir(run: () => Promise<void>): Promise<void> {
  const previous = process.env.TMPDIR
  const dir = mkdtempSync(join(tmpdir(), 'worker-io-smoke-'))
  process.env.TMPDIR = dir
  try {
    await run()
  } finally {
    restoreTmpdir(previous)
    rmSync(dir, { recursive: true, force: true })
  }
}

function restoreTmpdir(previous: string | undefined): void {
  if (previous === undefined) delete process.env.TMPDIR
  else process.env.TMPDIR = previous
}
