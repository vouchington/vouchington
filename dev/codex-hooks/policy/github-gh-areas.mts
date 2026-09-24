import type { BlockDecision } from './core.mts'
import type { GhInvocation } from './github-invocation.mts'

const GITHUB_POLICIES =
  'the GitHub policies (draft-first PRs, merge authority, the gh stack allowlist)'

// gh's own top-level commands, built-in aliases and help topics (`gh help reference`, `gh --help`,
// individual `gh <topic>` pages), plus the `stack` extension this hook already treats as a gh
// area. A local extension or user-defined alias outside this closed set (`gh image`, `gh co`) is
// deliberately excluded: the hook cannot read what it runs, the same as `gh alias import` above.
export const GH_AREAS: ReadonlySet<string> = new Set([
  // CORE COMMANDS
  'auth',
  'browse',
  'codespace',
  'discussion',
  'gist',
  'issue',
  'org',
  'pr',
  'project',
  'release',
  'repo',
  'skill',
  // GITHUB ACTIONS COMMANDS
  'cache',
  'run',
  'workflow',
  // ADDITIONAL COMMANDS
  'agent-task',
  'alias',
  'api',
  'attestation',
  'completion',
  'config',
  'copilot',
  'extension',
  'gpg-key',
  'label',
  'licenses',
  'preview',
  'ruleset',
  'search',
  'secret',
  'ssh-key',
  'status',
  'variable',
  // gh's own built-in aliases for the commands above (`gh help reference`)
  'agent-tasks',
  'agent',
  'agents',
  'at',
  'cs',
  'ext',
  'extensions',
  'rs',
  'skills',
  // HELP TOPICS
  'accessibility',
  'actions',
  'environment',
  'exit-codes',
  'formatting',
  'mintty',
  'reference',
  'telemetry',
  // local extension already special-cased via github-stack-workflow.mts
  'stack',
  // bare `gh help` / `gh version`, and the literal flags `scanGhInvocation` can read as an area
  'help',
  'version',
  '--help',
  '--version',
])

// Areas an actual GitHub policy keys on: pr/issue (draft-first, merge authority, closing refs),
// stack and its `gh extension exec stack` / `gh ext exec stack` spelling (merge authority), api
// (merge-shaped endpoints, github-api-merge-options.mts), and alias (the unreadable-alias check in
// github-opaque-gh-policy.mts). A variable executable this hook cannot resolve fails closed only
// when it sits next to one of these, so ordinary ones (`$DOCKER run`, `"$PYTHON" --version`) stay
// unblocked even though `run` and `--version` are themselves valid (but not policy-gated) areas.
export const POLICY_GATED_GH_AREAS: ReadonlySet<string> = new Set([
  'alias',
  'api',
  'ext',
  'extension',
  'extensions',
  'issue',
  'pr',
  'stack',
])

/**
 * `gh m 1` uses `m` as a gh area, which is either a typo, a local extension, or a user alias
 * defined outside the inspected command (an alias defined inline is exempt: see
 * `ghAliasSetNames`). gh's own areas are a closed set, so anything else fails closed the same way
 * as an alias/extension the hook cannot read.
 */
export function findUnknownGhAreaBlock(
  tokens: string[],
  invocation: GhInvocation | null,
): BlockDecision | null {
  if (invocation === null || GH_AREAS.has(invocation.area)) return null
  if (ghAliasSetNames(tokens).has(invocation.area)) return null
  return {
    reason: `\`gh ${invocation.area}\` is not one of gh's built-in top-level commands, so it may be an alias or extension the hook cannot read and cannot check against ${GITHUB_POLICIES}. Use the full gh command instead.`,
  }
}

// `gh alias set NAME '...'` defines NAME inside the inspected command; its literal expansion is
// checked as a payload (github-wrapper-payloads.mts), so a later `gh NAME` is not an unknown area.
function ghAliasSetNames(tokens: string[]): Set<string> {
  const names = new Set<string>()
  for (let index = 0; index < tokens.length - 2; index += 1) {
    const executable = tokens[index].slice(tokens[index].lastIndexOf('/') + 1)
    if (executable !== 'gh' || tokens[index + 1] !== 'alias' || tokens[index + 2] !== 'set') {
      continue
    }
    let cursor = index + 3
    while (cursor < tokens.length && tokens[cursor].startsWith('-') && tokens[cursor] !== '-') {
      cursor += 1
    }
    if (cursor < tokens.length) names.add(tokens[cursor])
  }
  return names
}
