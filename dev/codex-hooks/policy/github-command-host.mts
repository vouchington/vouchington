import { commandPrefixAt, commandSegmentStart } from './github-command-position.mts'
import { plainShellAssignment } from './shell-token-utils.mts'

const MODELED_PREFIX_WORD = /^(?:env|command|-u.+|--unset=.+)$/

export function githubHostIsProven(
  tokens: string[],
  index: number,
  isTopLevelCommand: boolean,
): boolean {
  const prefix = tokens.slice(commandSegmentStart(tokens, index), index)
  const env = commandPrefixAt(tokens, index)?.env
  if (env === undefined || !prefixOnlySetsVariables(prefix)) return false
  const inherited = isTopLevelCommand && followsOnlyChainedCds(tokens, index)
  if (!('GH_HOST' in env) && !inherited) return false
  const host = 'GH_HOST' in env ? env.GH_HOST : process.env.GH_HOST
  return host?.toLowerCase() === 'github.com'
}

export function githubHostAllowsCheckout(
  tokens: string[],
  index: number,
  isTopLevelCommand: boolean,
): boolean {
  const prefix = tokens.slice(commandSegmentStart(tokens, index), index)
  const env = commandPrefixAt(tokens, index)?.env
  if (env === undefined || !prefixOnlySetsVariables(prefix)) return false
  const inherited = isTopLevelCommand && followsOnlyChainedCds(tokens, index)
  if (!('GH_HOST' in env) && !inherited) return false
  const host = 'GH_HOST' in env ? env.GH_HOST : process.env.GH_HOST
  return host === undefined || host === '' || host.toLowerCase() === 'github.com'
}

export function prefixOnlySetsVariables(prefix: string[]): boolean {
  for (let cursor = 0; cursor < prefix.length; cursor += 1) {
    const word = prefix[cursor]
    if ((word === '-u' || word === '--unset') && cursor + 1 < prefix.length) {
      cursor += 1
    } else if (plainShellAssignment(word) === null && !MODELED_PREFIX_WORD.test(word)) {
      return false
    }
  }
  return true
}

export function followsOnlyChainedCds(tokens: string[], index: number): boolean {
  for (let start = commandSegmentStart(tokens, index); start > 0;) {
    if (tokens[start - 1] !== '&&') {
      return false
    }
    start = commandSegmentStart(tokens, start - 1)
    if (tokens[start] !== 'cd') {
      return false
    }
  }
  return true
}
