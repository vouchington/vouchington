import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTestHomes, execFileAsync } from './with-host-lock.test-helpers.mts'

const diagnosticsScript = join(process.cwd(), 'ci/host-pressure-diagnostics.sh')

describe('ci/host-pressure-diagnostics.sh', () => {
  afterEach(cleanupTestHomes)

  it('emits bounded cross-platform host and runner evidence without failing', async () => {
    const { stdout } = await execFileAsync('bash', [diagnosticsScript], {
      env: { ...process.env, LC_ALL: 'C' },
      maxBuffer: 1024 * 1024,
    })

    expect(stdout).toContain('== host pressure diagnostics ==')
    expect(stdout).toContain('platform:')
    expect(stdout).toContain('== top rss processes ==')
    expect(stdout).toContain('== runner worker/listener counts ==')
    expect(stdout.length).toBeLessThan(1024 * 1024)
  })
})
