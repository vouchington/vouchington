import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createTmuxRun, runTmuxCommand, type TmuxCliDeps } from 'vouchington-tooling/tmux'

const worktreeRoot = resolve(import.meta.dirname, '..')
type LaunchOptions = TmuxCliDeps & { prepare?: () => number }

export function launchServices(args: readonly string[], options: LaunchOptions = {}): number {
  const { prepare = prepareServices, ...deps } = options
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    ;(
      deps.out ??
      ((text: string) => {
        process.stdout.write(text)
      })
    )('Usage: ./dev/tmux [--no-attach] [-v|--verbose]\n')
    return 0
  }
  const env = deps.env ?? process.env
  const tmux = deps.tmux ?? createTmuxRun(env.TMUX_TARGET_BIN || 'tmux')
  let preparationStatus: number | undefined
  return runTmuxCommand(
    [
      'up',
      ...args,
      '--root',
      worktreeRoot,
      '--config',
      resolve(worktreeRoot, 'dev/services.tmux.json'),
    ],
    {
      ...deps,
      tmux(command, inherit) {
        // SDK parsing, binary availability, nesting and config checks precede its first session operation.
        if (command[0] !== '-V') {
          preparationStatus ??= prepare()
          if (preparationStatus !== 0) return { status: preparationStatus, stdout: '' }
        }
        return tmux(command, inherit)
      },
    },
  )
}

function prepareServices(): number {
  return (
    spawnSync(resolve(worktreeRoot, 'dev/prepare-services'), [], {
      cwd: worktreeRoot,
      stdio: 'inherit',
    }).status ?? 1
  )
}

if (import.meta.main) process.exitCode = launchServices(process.argv.slice(2))
