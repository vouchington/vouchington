import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupTestHomes,
  completion,
  execFileAsync,
  hostLockEnv,
  makeHome,
  spawnHostLock,
  waitForPath,
} from './with-host-lock.test-helpers.mts'

const heavySlotScript = join(process.cwd(), 'ci/with-heavy-slot.sh')

describe('ci/with-heavy-slot.sh', () => {
  afterEach(cleanupTestHomes)

  it('rejects a missing command', async () => {
    const home = await makeHome()

    await expect(
      execFileAsync('bash', [heavySlotScript], { env: hostLockEnv(home) }),
    ).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining('usage'),
    })
  })

  it('uses one slot and fails closed locally when it is occupied', async () => {
    const home = await makeHome()
    const lock = join(home, '.cache/voucha/memory-heavy-slot-1.lock.d')
    const marker = join(home, 'must-not-run')
    const holder = spawnHostLock(home, 'memory-heavy', 5, ['sleep', '10'], {}, ['--slots', '1'])
    const held = completion(holder)
    await waitForPath(join(lock, 'owner.token'))

    try {
      await expect(
        execFileAsync('bash', [heavySlotScript, 'touch', marker], {
          env: hostLockEnv(home, {
            GITHUB_ACTIONS: '',
            VOUCHA_HEAVY_SLOT_WAIT_SECONDS: '1',
          }),
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('not acquired'),
      })
      await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      holder.kill('SIGTERM')
      await held
    }
  })

  it('runs unlocked on CI once the wait elapses', async () => {
    const home = await makeHome()
    const lock = join(home, '.cache/voucha/memory-heavy-slot-1.lock.d')
    const marker = join(home, 'ran-unlocked')
    const holder = spawnHostLock(home, 'memory-heavy', 5, ['sleep', '10'], {}, ['--slots', '1'])
    const held = completion(holder)
    await waitForPath(join(lock, 'owner.token'))

    try {
      await expect(
        execFileAsync('bash', [heavySlotScript, 'touch', marker], {
          env: hostLockEnv(home, {
            GITHUB_ACTIONS: 'true',
            VOUCHA_HEAVY_SLOT_WAIT_SECONDS: '1',
          }),
        }),
      ).resolves.toMatchObject({
        stderr: expect.stringContaining('running unlocked'),
      })
      await expect(stat(lock)).resolves.toBeDefined()
      await expect(stat(marker)).resolves.toBeDefined()
    } finally {
      holder.kill('SIGTERM')
      await held
    }
  })

  it.each(['0', '-1', '61', 'not-a-number'])(
    'rejects an invalid wait override: %s',
    async waitSeconds => {
      const home = await makeHome()

      await expect(
        execFileAsync('bash', [heavySlotScript, 'true'], {
          env: hostLockEnv(home, {
            VOUCHA_HEAVY_SLOT_WAIT_SECONDS: waitSeconds,
          }),
        }),
      ).rejects.toMatchObject({
        code: 2,
        stderr: expect.stringContaining('no greater than 60'),
      })
    },
  )

  it('propagates the acquired command status', async () => {
    const home = await makeHome()

    await expect(
      execFileAsync('bash', [heavySlotScript, 'bash', '-c', 'exit 7'], {
        env: hostLockEnv(home),
      }),
    ).rejects.toMatchObject({
      code: 7,
      stdout: expect.stringContaining('== host pressure diagnostics =='),
    })
  })

  it('applies an optional command timeout after acquiring a slot', async () => {
    const home = await makeHome()

    await expect(
      execFileAsync('bash', [heavySlotScript, 'sleep', '30'], {
        env: hostLockEnv(home, {
          VOUCHA_HEAVY_SLOT_COMMAND_TIMEOUT_SECONDS: '1',
        }),
      }),
    ).rejects.toMatchObject({
      code: 124,
      stdout: expect.stringContaining('== host pressure diagnostics =='),
    })
  })
})
