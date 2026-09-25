export type ProcessResult = {
  error?: Error
  status: number | null
  stdout: string
  stderr: string
}

export type ProcessOptions = {
  cwd: string
  encoding: 'utf8'
  maxBuffer: number
  shell: false
}

// Structurally compatible with `spawnSync`, so production passes it directly and tests inject a
// fake at the process boundary.
export type ProcessExecutor = (
  command: string,
  args: string[],
  options: ProcessOptions,
) => ProcessResult

export type JscpdRunContext = {
  cwd: string
  env: Readonly<Record<string, string | undefined>>
  execute: ProcessExecutor
  log: (line: string) => void
  error: (line: string) => void
}

// `git ls-files` alone is over 1 MiB in this repository, past spawnSync's default maxBuffer.
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024

export function runProcess(
  context: JscpdRunContext,
  command: string,
  args: string[],
): ProcessResult {
  const result = context.execute(command, args, {
    cwd: context.cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: false,
  })
  if (result.error) throw result.error
  return result
}

export function describeFailure(command: string, args: string[], result: ProcessResult): string {
  const status = result.status === null ? 'a signal' : `status ${result.status}`
  const detail = result.stderr.trim()
  return `${command} ${args.join(' ')} exited with ${status}${detail ? `: ${detail}` : ''}`
}
