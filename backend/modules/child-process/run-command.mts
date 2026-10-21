import { spawn } from 'node:child_process'
import { Writable } from 'node:stream'
import { CommandFailedError } from './command-failed-error.mts'
import {
  classifyFailure,
  collectCappedStderr,
  killChild,
  pipeStdin,
  pipeStdout,
  waitForChild,
} from './run-command-process.mts'

const DEFAULT_STDERR_CAP_BYTES = 65_536

export type { CommandFailureReason } from './command-failed-error.mts'
export { CommandFailedError } from './command-failed-error.mts'

export type RunCommandOptions = {
  command: string
  args?: readonly string[]
  stdin?: ReadableStreamInput
  stdout?: Writable
  signal?: AbortSignal
  timeoutMs: number
  stderrCapBytes?: number
  env?: NodeJS.ProcessEnv
}

type ReadableStreamInput = import('node:stream').Readable | Uint8Array | string

// Spawns `command` with an explicit argv and no shell. Stdin and stdout stay
// streams. Stderr is retained only up to a byte cap. `LC_ALL=C` is forced.
// Abort and the timeout both SIGKILL the child; a non-zero exit or a signal rejects.
export async function runCommand(options: RunCommandOptions): Promise<{ stderr: Buffer }> {
  if (options.command.length === 0) throw new Error('command must not be empty')
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive finite number')
  }
  if (options.signal?.aborted) {
    throw new CommandFailedError(options.command, {
      reason: 'abort',
      exitCode: null,
      signal: null,
      stderr: Buffer.alloc(0),
    })
  }

  const child = spawn(options.command, [...(options.args ?? [])], {
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...options.env,
      LC_ALL: 'C',
    },
  })

  let aborted = false
  let timedOut = false
  let stdinError: Error | undefined
  let stdoutError: Error | undefined
  const stderr = collectCappedStderr(child, options.stderrCapBytes ?? DEFAULT_STDERR_CAP_BYTES)
  pipeStdin(child, options.stdin, err => {
    stdinError = err
  })
  pipeStdout(child, options.stdout, err => {
    stdoutError = err
    killChild(child)
  })

  const onAbort = () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    aborted = true
    killChild(child)
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    if (child.exitCode !== null || child.signalCode !== null) return
    timedOut = true
    killChild(child)
  }, options.timeoutMs)
  timer.unref()

  try {
    const outcome = await waitForChild(child)
    if (outcome.kind === 'error') throw outcome.error
    const failure = classifyFailure({
      command: options.command,
      aborted,
      timedOut,
      stdinError,
      stdoutError,
      exitCode: outcome.exitCode,
      signal: outcome.signal,
      stderr: stderr.bytes(),
    })
    if (failure) throw failure
    return { stderr: stderr.bytes() }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
