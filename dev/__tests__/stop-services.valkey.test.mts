import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeStopServicesRepo, readLog, runScript } from '../test-helpers/stop-services-repo.mts'
import { makeStopServicesTmuxFakeBin } from '../test-helpers/stop-services-tmux.mts'

const testDirs: string[] = []

function makeRepo(options: { isMainWorktree?: boolean; withEnv?: boolean } = {}) {
  return makeStopServicesRepo(testDirs, { ...options, profile: 'valkey' })
}

describe('dev/stop-services (Valkey and reset)', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('stops the configured Valkey container by default', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: 'voucha-valkey-test',
      },
    })

    expect(result.log).toContain('docker ps --format {{.Names}}')
    expect(result.log).toContain('docker stop voucha-valkey-test')
  })

  it('fails instead of reporting Valkey as not running when Docker is unreachable', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    await expect(
      runScript({ binDir, cwd, env: { FAKE_DOCKER_PS_FAIL: '1' } }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("'docker ps' failed"),
      stdout: expect.not.stringMatching(/not running|Service stop complete/),
    })
    expect(await readLog(join(cwd, 'commands.log'))).not.toContain('docker stop')
  })

  it('keeps Valkey running when requested', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    const result = await runScript({
      args: ['--keep-valkey'],
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: 'voucha-valkey-test',
      },
    })

    expect(result.stdout).toContain('Keeping Valkey running')
    expect(result.log).not.toContain('docker stop voucha-valkey-test')
  })

  it('succeeds when the worktree has no web environment', async () => {
    const cwd = await makeRepo({ withEnv: false })
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    const result = await runScript({ binDir, cwd, env: { VALKEY_CONTAINER: '' } })

    expect(result.stdout).toContain('No tmux session for this worktree')
    expect(result.stdout).toContain('Valkey container not configured')
    expect(result.stdout).toContain('Service stop complete')
  })

  it('runs reset through stop-services with Valkey preserved before DB reset', async () => {
    const cwd = await makeRepo()
    const binDir = await makeStopServicesTmuxFakeBin(testDirs)

    const result = await runScript({
      binDir,
      cwd,
      env: {
        FAKE_DOCKER_PS: 'voucha-valkey-test',
      },
      script: 'reset',
    })

    expect(result.stdout).toContain('Keeping Valkey running (--keep-valkey)')
    expect(result.log).not.toContain('docker stop voucha-valkey-test')
    expect(result.log).toContain('docker exec voucha-valkey-test valkey-cli FLUSHALL')
    expect(result.log).toContain('dropdb --if-exists -- voucha-test')
    expect(result.log).toContain('createdb -- voucha-test')
    expect(result.log).toContain('pnpm run db:migrate')
  })
})
