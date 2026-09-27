import { execFile, type ChildProcess } from 'node:child_process'

export type BoundedCommand = {
  args: string[]
  cwd?: string
  executable: string
  maxOutputBytes: number
  signal?: AbortSignal
  timeoutMs: number
}

export function runBoundedCommand(command: BoundedCommand): Promise<string> {
  const args = [...command.args]
  const cwd = command.cwd
  const executable = command.executable
  const maxOutputBytes = command.maxOutputBytes
  const signal = command.signal
  const timeoutMs = command.timeoutMs
  if (
    !executable ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 60_000 ||
    !Number.isSafeInteger(maxOutputBytes) ||
    maxOutputBytes <= 0 ||
    maxOutputBytes > 16 * 1024 * 1024 ||
    signal?.aborted
  )
    return Promise.reject(new Error('invalid or cancelled bounded command'))
  return new Promise((resolve, reject) => {
    let child: ChildProcess
    let cancelled = false
    const cancel = () => {
      cancelled = true
      child.kill('SIGKILL')
    }
    child = execFile(
      executable,
      args,
      {
        cwd,
        encoding: 'utf8',
        killSignal: 'SIGKILL',
        maxBuffer: maxOutputBytes,
        shell: false,
        timeout: timeoutMs,
      },
      (error, stdout) => {
        signal?.removeEventListener('abort', cancel)
        if (error || cancelled) reject(error ?? new Error('bounded command cancelled'))
        else resolve(stdout)
      },
    )
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
  })
}
