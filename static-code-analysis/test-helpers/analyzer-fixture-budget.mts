import { execFile, spawnSync } from 'node:child_process'

// Only finite analyzer unit fixtures use this budget; normal CLI defaults stay unchanged.
export function createAnalyzerFixtureBudget() {
  const deadline = process.hrtime.bigint() + 4_000_000_000n
  const remaining = () => {
    const milliseconds = Number((deadline - process.hrtime.bigint()) / 1_000_000n)
    if (milliseconds <= 0) throw new Error('Analyzer fixture case deadline exhausted')
    return milliseconds
  }
  const actors: { pid: number | undefined; closed: boolean }[] = []
  return {
    actors,
    git: (args: string[]) => spawnSync('git', args, { encoding: 'utf8', timeout: remaining() }),
    check: (cli: string, root: string) => {
      // Lock wait precedes execution. Reserve one second for it and 500ms for launch/exit.
      const seconds = Math.floor((remaining() - 1_500) / 1_000)
      if (seconds < 1) throw new Error('Insufficient analyzer fixture case budget')
      return new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = execFile(
          process.execPath,
          [
            cli,
            '--lock-timeout',
            '1',
            '--timeout',
            String(seconds),
            'check',
            '--root',
            root,
            '--format',
            'json',
          ],
          { cwd: root, encoding: 'utf8' },
          (err, stdout, stderr) => {
            if (!err) resolve({ status: 0, stdout, stderr })
            else if (typeof err.code === 'number') resolve({ status: err.code, stdout, stderr })
            else
              reject(
                err instanceof Error
                  ? err
                  : new Error('Analyzer fixture launch failed', { cause: err }),
              )
          },
        )
        const actor = { pid: child.pid, closed: false }
        actors.push(actor)
        child.once('close', () => {
          actor.closed = true
        })
      })
    },
  }
}
