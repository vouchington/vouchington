import { spawn } from 'node:child_process'
import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
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
}

type ReadableStreamInput = import('node:stream').Readable | Uint8Array | string

// Spawns `command` with an explicit argv and no shell. Stdin and stdout stay
// streams. Stderr is retained only up to a byte cap. The child receives PATH,
// TMPDIR, and `LC_ALL=C` only. Abort and the timeout both SIGKILL the child;
// a non-zero exit or a signal rejects.
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
    env: childEnvironment(),
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
    // The child can close before an async stdout destination finishes its writes.
    await settleStdout(options.stdout, err => {
      if (!stdoutError) stdoutError = err
    })
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

function childEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { LC_ALL: 'C' }
  const path = process.env.PATH
  const tempDir = process.env.TMPDIR
  if (path !== undefined) env.PATH = path
  if (tempDir !== undefined) env.TMPDIR = tempDir
  return env
}

async function settleStdout(
  stdout: Writable | undefined,
  onError: (err: Error) => void,
): Promise<void> {
  if (!stdout) return
  try {
    await finished(stdout)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
