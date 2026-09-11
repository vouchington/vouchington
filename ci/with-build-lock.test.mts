import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildLockScript,
  cleanupTestHomes,
  completion,
  execFileAsync,
  hostLockEnv,
  makeHome,
  spawnHostLock,
  waitForPath,
} from './with-host-lock.test-helpers.mts'

describe('ci/with-build-lock.sh', () => {
  afterEach(cleanupTestHomes)

  it('uses the expensive-build family and fails closed after its configured wait', async () => {
    const home = await makeHome()
    const marker = join(home, 'must-not-run')
    const lock = join(home, '.cache/voucha/expensive-build.lock.d')
    const holder = spawnHostLock(home, 'expensive-build', 5, ['sleep', '10'])
    const held = completion(holder)
    await waitForPath(join(lock, 'owner.token'))

    await expect(
      execFileAsync('bash', [buildLockScript, 'touch', marker], {
        // GITHUB_ACTIONS must be forced unset here: this suite itself runs inside
        // GitHub Actions, where the real env var is present and would otherwise
        // flip the script's default to run-unlocked, breaking this "local" case.
        env: hostLockEnv(home, {
          VOUCHA_BUILD_LOCK_WAIT_SECONDS: '1',
          GITHUB_ACTIONS: '',
        }),
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('not acquired'),
    })
    await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })

    holder.kill('SIGTERM')
    await held
  })

  it('has no command-timeout cap locally by default', async () => {
    const home = await makeHome()
    const lock = join(home, '.cache/voucha/expensive-build.lock.d')
    const memorySlot = join(home, '.cache/voucha/memory-heavy-slot-1.lock.d')

    await expect(
      execFileAsync('bash', [buildLockScript, 'bash', '-c', 'sleep 1.2; exit 0'], {
        env: hostLockEnv(home, { GITHUB_ACTIONS: '' }),
      }),
    ).resolves.toMatchObject({
      stderr: expect.stringMatching(/^with-host-lock: expensive-build acquired after \d+s\n$/),
    })
    await expect(stat(lock)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(memorySlot)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps the build lock tied to the command if the wrapper is killed', async () => {
    const home = await makeHome()
    const commandPidFile = join(home, 'command-pid')
    const ready = join(home, 'ready')
    const marker = join(home, 'must-not-run')
    const recoveredMarker = join(home, 'recovered')
    const lock = join(home, '.cache/voucha/expensive-build.lock.d')
    const wrapper = spawn(
      'bash',
      [
        buildLockScript,
        'bash',
        '-c',
        String.raw`trap 'exit 0' TERM; printf '%s\n' "$$" > "$1"; touch "$2"; while :; do sleep 1; done`,
        'build-lock-test',
        commandPidFile,
        ready,
      ],
      {
        env: hostLockEnv(home, { GITHUB_ACTIONS: '' }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const wrapperDone = completion(wrapper)
    await waitForPath(ready)
    const commandPid = (await readFile(commandPidFile, 'utf8')).trim()
    try {
      if (wrapper.pid == null) throw new Error('Could not start the build-lock wrapper.')
      await execFileAsync('kill', ['-s', 'KILL', String(wrapper.pid)])
      await expect.poll(() => readFile(join(lock, 'owner.pid'), 'utf8')).toBe(`${commandPid}\n`)
      await expect(
        execFileAsync('bash', [buildLockScript, 'touch', marker], {
          env: hostLockEnv(home, {
            VOUCHA_BUILD_LOCK_WAIT_SECONDS: '1',
            GITHUB_ACTIONS: '',
          }),
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining('not acquired'),
      })
      await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })

      await execFileAsync('kill', ['-s', 'TERM', commandPid])
      await execFileAsync('bash', [buildLockScript, 'touch', recoveredMarker], {
        env: hostLockEnv(home, {
          VOUCHA_BUILD_LOCK_WAIT_SECONDS: '3',
          GITHUB_ACTIONS: '',
        }),
      })
      await expect(readFile(recoveredMarker, 'utf8')).resolves.toBe('')
    } finally {
      try {
        await execFileAsync('kill', ['-s', 'TERM', commandPid])
      } catch {
        // The command already exited after the successful recovery path.
      }
      wrapper.kill('SIGKILL')
      await wrapperDone
    }
  })

  it('preserves the command timeout if the wrapper is killed', async () => {
    const home = await makeHome()
    const commandPidFile = join(home, 'timed-command-pid')
    const ready = join(home, 'timed-command-ready')
    const recoveredMarker = join(home, 'timed-command-recovered')
    const wrapper = spawn(
      'bash',
      [
        buildLockScript,
        'bash',
        '-c',
        String.raw`trap '' TERM; printf '%s\n' "$$" > "$1"; touch "$2"; while :; do sleep 1; done`,
        'build-lock-timeout-test',
        commandPidFile,
        ready,
      ],
      {
        env: hostLockEnv(home, {
          GITHUB_ACTIONS: '',
          VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS: '1',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const wrapperDone = completion(wrapper)
    await waitForPath(ready)
    const commandPid = (await readFile(commandPidFile, 'utf8')).trim()
    try {
      if (wrapper.pid == null) throw new Error('Could not start the build-lock wrapper.')
      await execFileAsync('kill', ['-s', 'KILL', String(wrapper.pid)])
      await expect
        .poll(
          async () => {
            try {
              await execFileAsync('kill', ['-0', commandPid])
              return true
            } catch {
              return false
            }
          },
          { interval: 100, timeout: 9000 },
        )
        .toBe(false)

      await execFileAsync('bash', [buildLockScript, 'touch', recoveredMarker], {
        env: hostLockEnv(home, {
          VOUCHA_BUILD_LOCK_WAIT_SECONDS: '3',
          GITHUB_ACTIONS: '',
        }),
      })
      await expect(readFile(recoveredMarker, 'utf8')).resolves.toBe('')
    } finally {
      try {
        await execFileAsync('kill', ['-s', 'TERM', commandPid])
      } catch {
        // The command already exited through the timeout path.
      }
      wrapper.kill('SIGKILL')
      await wrapperDone
    }
  })

  it('runs unlocked on CI once the wait elapses, still capped by the command timeout', async () => {
    const home = await makeHome()
    const lock = join(home, '.cache/voucha/expensive-build.lock.d')
    const marker = join(home, 'ran-unlocked')
    const holder = spawnHostLock(home, 'expensive-build', 5, ['sleep', '10'])
    const held = completion(holder)
    await waitForPath(join(lock, 'owner.token'))

    const start = Date.now()
    const result = await completion(
      spawn(
        'bash',
        [buildLockScript, 'bash', '-c', 'touch "$1"; sleep 30', 'build-lock-test', marker],
        {
          env: hostLockEnv(home, {
            GITHUB_ACTIONS: 'true',
            VOUCHA_BUILD_LOCK_WAIT_SECONDS: '1',
            VOUCHA_BUILD_LOCK_COMMAND_TIMEOUT_SECONDS: '1',
          }),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    )
    const elapsed = Date.now() - start

    expect(result.code).toBe(124)
    expect(elapsed).toBeGreaterThanOrEqual(1000)
    await expect(readFile(marker, 'utf8')).resolves.toBe('')
    // The original holder's lock was never touched by the unlocked contender.
    await expect(stat(lock)).resolves.toBeDefined()

    holder.kill('SIGTERM')
    await held
  })

  it('fails closed on CI when the caller opts into strict acquisition', async () => {
    const home = await makeHome()
    const marker = join(home, 'must-not-run')
    const lock = join(home, '.cache/voucha/expensive-build.lock.d')
    const holder = spawnHostLock(home, 'expensive-build', 5, ['sleep', '10'])
    const held = completion(holder)
    await waitForPath(join(lock, 'owner.token'))

    await expect(
      execFileAsync('bash', [buildLockScript, 'touch', marker], {
        env: hostLockEnv(home, {
          GITHUB_ACTIONS: 'true',
          VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT: 'fail',
          VOUCHA_BUILD_LOCK_WAIT_SECONDS: '1',
        }),
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('not acquired'),
    })
    await expect(stat(marker)).rejects.toMatchObject({ code: 'ENOENT' })

    holder.kill('SIGTERM')
    await held
  })

  it('rejects an invalid acquisition-timeout policy', async () => {
    const home = await makeHome()

    await expect(
      execFileAsync('bash', [buildLockScript, 'true'], {
        env: hostLockEnv(home, {
          VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT: 'retry',
        }),
      }),
    ).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining('must be fail or run-unlocked'),
    })
  })

  it.each(['0', '-1', '301', 'not-a-number'])(
    'rejects an invalid wait override: %s',
    async waitSeconds => {
      const home = await makeHome()

      await expect(
        execFileAsync('bash', [buildLockScript, 'true'], {
          env: hostLockEnv(home, {
            VOUCHA_BUILD_LOCK_WAIT_SECONDS: waitSeconds,
          }),
        }),
      ).rejects.toMatchObject({
        code: 2,
        stderr: expect.stringContaining('no greater than 300'),
      })
    },
  )
})
