import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('worker-io backend automation flag', () => {
  it('derives active images from the checked-in boolean flag', () => {
    const flagText = readFileSync('.github/worker-io-automation.env', 'utf8')
    const flagMatch = /^WORKER_IO_AUTOMATION_ENABLED=(true|false)\n$/.exec(flagText)

    expect(flagMatch).not.toBeNull()

    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'worker-io-automation-'))
    const outputPath = join(temporaryDirectory, 'github-output')
    try {
      const result = spawnSync('bash', ['.github/actions/build-backend-images/set-image-set.sh'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: outputPath },
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      const outputs = Object.fromEntries(
        readFileSync(outputPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => line.split('=')),
      )
      const workerIoEnabled = flagMatch?.[1] === 'true'
      expect(outputs).toMatchObject({
        active_worker_images: workerIoEnabled ? 'worker-cpu worker-io' : 'worker-cpu',
        worker_io_automation_enabled: workerIoEnabled ? 'true' : 'false',
      })
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true })
    }
  })
})
