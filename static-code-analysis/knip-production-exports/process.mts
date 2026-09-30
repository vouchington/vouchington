import { spawn } from 'node:child_process'

export interface ProcessResult {
  /** Set when the process could not be started. */
  error?: Error
  signal: NodeJS.Signals | null
  status: number | null
  stderr: string
  stdout: string
}

export interface ProcessOptions {
  abort?: AbortSignal
  cwd: string
  input?: string
}

/**
 * Runs a command without a shell and collects its output. Aborting kills the child with the
 * signal named by `abort.reason` and still waits for it to exit, so callers only continue once
 * nothing else touches the working tree. An already-aborted signal skips the spawn entirely.
 */
export function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  const { abort, cwd, input } = options
  if (abort?.aborted) {
    return Promise.resolve({ signal: null, status: null, stderr: '', stdout: '' })
  }
  return new Promise(resolve => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    const kill = () => {
      child.kill(typeof abort?.reason === 'string' ? (abort.reason as NodeJS.Signals) : 'SIGTERM')
    }
    const finish = (result: Partial<ProcessResult>) => {
      abort?.removeEventListener('abort', kill)
      resolve({
        signal: null,
        status: null,
        stderr: Buffer.concat(stderr).toString('utf8'),
        stdout: Buffer.concat(stdout).toString('utf8'),
        ...result,
      })
    }
    abort?.addEventListener('abort', kill, { once: true })
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.on('error', error => finish({ error }))
    child.on('close', (status, signal) => finish({ signal, status }))
    // A child that exits before reading stdin raises EPIPE on this stream; its exit status wins.
    child.stdin.on('error', () => undefined)
    child.stdin.end(input)
  })
}
