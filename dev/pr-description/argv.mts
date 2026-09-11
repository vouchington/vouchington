export type ParsedBodyFileArg = { bodyFile: string | undefined; remaining: string[] }

/** Shared by `validate`, `create`, and `update` — the only flag common to all three subcommands. */
export function parseBodyFileArg(argv: string[]): ParsedBodyFileArg {
  let bodyFile: string | undefined
  const remaining: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--body-file' || argv[i] === '-F') {
      if (bodyFile !== undefined) throw new Error('body file may only be specified once')
      if (argv[i + 1] === undefined || (argv[i + 1] !== '-' && argv[i + 1].startsWith('-'))) {
        throw new Error(`${argv[i]} requires a value`)
      }
      bodyFile = argv[++i]
    } else remaining.push(argv[i])
  }
  return { bodyFile, remaining }
}

export type ParsedCreateArgs = {
  acknowledgeLargeDiff: boolean
  positionals: string[]
  title: string | undefined
}

/**
 * `create`-only: `--title`/`-t` and the boolean `--acknowledge-large-diff` escape hatch for the
 * ~5k-changed-line refusal (see `../diff-size.mts`), applied after `parseBodyFileArg` strips
 * `--body-file`.
 */
export function parseCreateArgs(argv: string[]): ParsedCreateArgs {
  let title: string | undefined
  let acknowledgeLargeDiff = false
  const positionals: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--title' || argv[i] === '-t') {
      if (title !== undefined) throw new Error('title may only be specified once')
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('-')) {
        throw new Error(`${argv[i]} requires a value`)
      }
      title = argv[++i]
    } else if (argv[i] === '--acknowledge-large-diff') {
      if (acknowledgeLargeDiff)
        throw new Error('--acknowledge-large-diff may only be specified once')
      acknowledgeLargeDiff = true
    } else if (argv[i].startsWith('-')) throw new Error(`unknown option: ${argv[i]}`)
    else positionals.push(argv[i])
  }
  return { acknowledgeLargeDiff, positionals, title }
}
