import {
  commandSegmentStart,
  isShellAssignment,
  isShellControlPrefix,
} from './github-command-context.mts'

export function isCommandPositionInvocation(tokens: string[], index: number): boolean {
  const segmentStart = commandSegmentStart(tokens, index)
  const prefix = tokens.slice(segmentStart, index)
  let sawEnv = false
  let sawCommand = false
  let sawExec = false

  for (let prefixIndex = 0; prefixIndex < prefix.length; prefixIndex += 1) {
    const token = prefix[prefixIndex]
    if (isShellAssignment(token)) {
      continue
    }

    if (isShellControlPrefix(token) && !sawEnv && !sawCommand) {
      continue
    }

    if (token === 'env' && !sawEnv && !sawCommand) {
      sawEnv = true
      continue
    }

    if (sawEnv && token.startsWith('-')) {
      const nextToken = prefix[prefixIndex + 1]
      if ((token === '-u' || token === '--unset') && nextToken !== undefined) {
        prefixIndex += 1
      }
      continue
    }

    // `rtk`/`nohup` are vetted passthrough wrappers that exec their arguments directly (e.g.
    // `rtk gh pr merge 123 --squash`, `nohup gh pr merge 123`) — treat them like `command`.
    if ((token === 'command' || token === 'rtk' || token === 'nohup') && !sawCommand) {
      sawCommand = true
      continue
    }

    // `exec` replaces the shell with the following command, so `exec gh pr merge 123` invokes
    // `gh` directly — treat it like `command`. Skip its own flags (`-a`, `-c`, `-l`) instead of
    // returning false, which would look unrecognized and let the merge block be bypassed.
    if (token === 'exec' && !sawCommand) {
      sawCommand = true
      sawExec = true
      continue
    }

    if (sawExec && /^-[cla]+$/.test(token)) {
      if (token.includes('a') && prefix[prefixIndex + 1] !== undefined) {
        prefixIndex += 1
      }
      continue
    }

    return false
  }

  return true
}
