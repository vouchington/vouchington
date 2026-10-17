import { execFile, spawnSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Only finite analyzer unit fixtures use this budget; normal CLI defaults stay unchanged.
export function createAnalyzerFixtureBudget(milliseconds = 4_000) {
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 4_000) {
    throw new RangeError('Analyzer fixture budget must be an integer from 1 to 4000 milliseconds')
  }
  const deadline = process.hrtime.bigint() + BigInt(milliseconds) * 1_000_000n
  const remaining = () => {
    const milliseconds = Number((deadline - process.hrtime.bigint()) / 1_000_000n)
    if (milliseconds <= 0) throw new Error('Analyzer fixture case deadline exhausted')
    return milliseconds
  }
  const actors: { pid: number | undefined; closed: boolean }[] = []
  const roots = new Set<string>()
  const owned = (root: string) => {
    if (!roots.has(root)) throw new Error('Analyzer fixture root is not owned by this budget')
    if (!lstatSync(root).isDirectory())
      throw new Error('Analyzer fixture root is no longer a directory')
  }
  return {
    actors,
    createRoot: async (prefix: string) => {
      if (!/^[a-z][a-z0-9-]{0,59}-$/.test(prefix)) {
        throw new Error('Analyzer fixture prefix must be a finite temporary-directory name')
      }
      const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
      roots.add(root)
      return root
    },
    git: (args: string[]) => {
      const root =
        args[0] === 'init' && args[1] === '-q' ? args[2] : args[0] === '-C' ? args[1] : undefined
      if (!root) throw new Error('Analyzer fixture Git command needs an owned root')
      owned(root)
      return spawnSync('git', args, { encoding: 'utf8', timeout: remaining() })
    },
    check: (cli: string, root: string) => {
      owned(root)
      // One native deadline owns acquisition and execution; keep launch/exit headroom.
      const milliseconds = remaining() - 500
      if (milliseconds <= 0) throw new Error('Insufficient analyzer fixture case budget')
      return new Promise<{ status: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = execFile(
          process.execPath,
          [
            cli,
            '--invocation-timeout-ms',
            String(milliseconds),
            '--verbose-timings',
            'check',
            '--root',
            root,
            '--format',
            'json',
          ],
          { cwd: root, encoding: 'utf8' },
          (err, stdout, stderr) => {
            if (!err) resolve({ status: 0, stdout, stderr })
            else if (typeof err.code === 'number') {
              if (err.code !== 1) console.error(`Analyzer fixture exited ${err.code}: ${stderr}`)
              resolve({ status: err.code, stdout, stderr })
            } else
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
