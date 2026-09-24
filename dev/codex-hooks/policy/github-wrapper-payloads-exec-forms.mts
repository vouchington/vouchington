import { parseOptions } from './shell-option-grammar.mts'
import type { ShellWord } from './shell-tokenizer.mts'
import { NPX_GRAMMAR, miseExecCommandValue } from './shell-wrapper-package-runner-grammars.mts'
import { SCRIPT_GRAMMAR } from './shell-wrapper-exec-grammars.mts'

/**
 * `npx -c/--call "gh pr merge 1"` runs its value through the shell, like eval's argument. Modeled
 * with npx's own grammar (rather than joined naively) so a `-p/--package` before `-c` is not
 * mistaken for part of the payload.
 */
export function npxCallPayload(args: ShellWord[]): string[] {
  const parsed = parseOptions(
    args.map(arg => arg.value),
    0,
    NPX_GRAMMAR,
  )
  const call = parsed?.options.find(option => option.name === 'call')?.value
  return call === undefined ? [] : [call]
}

/**
 * util-linux `script -c/--command "gh pr merge 1"` runs its value through the shell, the same
 * shape as npx's `-c`.
 */
export function scriptCommandPayload(args: ShellWord[]): string[] {
  const parsed = parseOptions(
    args.map(arg => arg.value),
    0,
    SCRIPT_GRAMMAR,
  )
  const command = parsed?.options.find(option => option.name === 'command')?.value
  return command === undefined ? [] : [command]
}

/**
 * `mise exec -c/--command "gh pr merge 1"` (or `mise x -c …`) runs its value through the shell,
 * the same shape as npx's and script's `-c`. Delegated to `miseExecCommandValue`
 * (shell-wrapper-package-runner-grammars.mts), which is also used by the opaque-gh safety net to
 * recognize this shape as already handled.
 */
export function miseCommandPayload(args: ShellWord[]): string[] {
  const value = miseExecCommandValue(args.map(arg => arg.value))
  return value === undefined ? [] : [value]
}
