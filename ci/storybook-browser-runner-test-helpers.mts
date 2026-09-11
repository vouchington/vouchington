import { EventEmitter } from 'node:events'

import { expect } from 'vitest'

import type { StorybookBrowserRunnerDeps } from './storybook-browser-runner.mts'
import type { Child } from './storybook-browser-runner-test-types.mts'

export type { Child } from './storybook-browser-runner-test-types.mts'

export interface SpawnCall {
  args: string[]
  env: NodeJS.ProcessEnv
}

export interface Interval {
  callback: () => void
}

export {
  emitProjectAnnotationsFetchFailure,
  emitStorybookAddonVitestSetupRunnerMissing,
  emitStorybookAddonVitestSetupRunnerMissingAnsi,
  emitStorybookAddonVitestSetupRunnerMissingOversized,
  storybookAddonVitestSetupRunnerMissingOversizedBlock,
} from './storybook-browser-runner-output-test-helpers.mts'

export function makeChild(pid: number | undefined): Child {
  return Object.assign(new EventEmitter(), {
    kill: () => true,
    pid,
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
  })
}

export function makeDeps(
  children: Child[],
  options: {
    exists?: (path: string) => boolean
    immediateTimeout?: boolean
    resultExists?: () => boolean
    now?: () => number
    onParentSignal?: StorybookBrowserRunnerDeps['onParentSignal']
    offParentSignal?: StorybookBrowserRunnerDeps['offParentSignal']
    isProcessGroupAlive?: StorybookBrowserRunnerDeps['isProcessGroupAlive']
    waitForProcessGroupExit?: StorybookBrowserRunnerDeps['waitForProcessGroupExit']
  } = {},
) {
  const spawnCalls: SpawnCall[] = []
  const intervals: Interval[] = []
  const killed: Array<{ pid: number; signal: NodeJS.Signals }> = []
  const copied: Array<{ dest: string; src: string }> = []
  const dirs: string[] = []
  const removed: string[] = []
  const stderr: string[] = []
  const stdout: string[] = []
  const clearedTimeouts: unknown[] = []
  const parentSignalListeners = new Map<NodeJS.Signals, Set<() => void>>()
  const timeouts: Array<{ callback: () => void; delay: number }> = []
  const written: Array<{ content: string; path: string }> = []
  let childIndex = 0
  const liveProcessGroups = new Set<number>()

  const deps: StorybookBrowserRunnerDeps = {
    clearInterval: timer => {
      const index = intervals.indexOf(timer as unknown as Interval)
      if (index !== -1) intervals.splice(index, 1)
    },
    clearTimeout: timer => {
      clearedTimeouts.push(timer)
    },
    cpSync: (src, dest) => {
      copied.push({ dest: String(dest), src: String(src) })
    },
    cwd: '/repo',
    existsSync: path => {
      if (options.exists) return options.exists(String(path))
      if (String(path).endsWith('.vitest-reports/web-storybook-browser.json')) {
        return options.resultExists?.() ?? false
      }
      return false
    },
    isProcessGroupAlive:
      options.isProcessGroupAlive ?? (processGroupId => liveProcessGroups.has(processGroupId)),
    killProcessGroup: (pid, signal) => {
      if (signal === 'SIGTERM') liveProcessGroups.add(pid)
      killed.push({ pid, signal })
    },
    mkdirSync: path => {
      dirs.push(String(path))
      return undefined
    },
    now: options.now ?? (() => 0),
    offParentSignal:
      options.offParentSignal ??
      ((signal, listener) => {
        parentSignalListeners.get(signal)?.delete(listener)
      }),
    onParentSignal:
      options.onParentSignal ??
      ((signal, listener) => {
        const listeners = parentSignalListeners.get(signal) ?? new Set<() => void>()
        listeners.add(listener)
        parentSignalListeners.set(signal, listeners)
      }),
    rmSync: path => {
      removed.push(String(path))
    },
    setInterval: ((callback: () => void) => {
      const interval = { callback }
      intervals.push(interval)
      return interval as unknown as ReturnType<typeof setInterval>
    }) as unknown as StorybookBrowserRunnerDeps['setInterval'],
    setTimeout: ((callback: () => void, delay?: number) => {
      const timeout = { callback, delay: delay ?? 0 }
      timeouts.push(timeout)
      if (options.immediateTimeout !== false && timeout.delay <= 5000) callback()
      return timeout as unknown as ReturnType<typeof setTimeout>
    }) as unknown as StorybookBrowserRunnerDeps['setTimeout'],
    spawn: ((
      _command: string,
      args?: readonly string[],
      spawnOptions?: { env?: NodeJS.ProcessEnv },
    ) => {
      const child = children[childIndex++]
      if (!child) throw new Error('unexpected spawn')
      spawnCalls.push({
        args: Array.isArray(args) ? args.map(String) : [],
        env: spawnOptions?.env ?? {},
      })
      return child as ReturnType<StorybookBrowserRunnerDeps['spawn']>
    }) as unknown as StorybookBrowserRunnerDeps['spawn'],
    stderr: {
      write: chunk => {
        stderr.push(String(chunk))
        return true
      },
    },
    stdout: {
      write: chunk => {
        stdout.push(String(chunk))
        return true
      },
    },
    writeFileSync: (path, content) => {
      written.push({ content: String(content), path: String(path) })
    },
    waitForProcessGroupExit:
      options.waitForProcessGroupExit ??
      (async processGroupId => {
        liveProcessGroups.delete(processGroupId)
      }),
  }

  return {
    copied,
    clearedTimeouts,
    deps,
    dirs,
    intervals,
    killed,
    removed,
    parentSignalListeners,
    spawnCalls,
    stderr,
    stdout,
    timeouts,
    written,
  }
}

export async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (predicate()) return
    await Promise.resolve()
  }
  expect(predicate()).toBe(true)
}
