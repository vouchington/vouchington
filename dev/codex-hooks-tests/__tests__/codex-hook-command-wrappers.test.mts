import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { findGitHubWorkflowBlock } from '../../codex-hooks/policy-helpers.mts'
import type { ReferencedIssue } from '../../pr-description/closing-refs.mts'

const MERGE_BLOCK = 'never delegated to an agent'
const XARGS_BLOCK = '`xargs` supplies this gh subcommand from its input'
const EXPANSION_BLOCK = 'This gh subcommand comes from a shell expansion'
const UNREADABLE_ALIAS_BLOCK = '`gh alias import` and `gh alias set NAME -` read alias expansions'
const OPEN_ISSUE: ReferencedIssue = {
  body: '',
  isPullRequest: false,
  number: 1,
  state: 'open',
  title: 'Open issue',
  url: 'https://github.com/owner/repo/issues/1',
}

function reasonFor(command: string): string | undefined {
  return findPreToolUseBlock({ tool_input: { command } })?.reason
}

// Wrappers whose options take an argument (`env -C DIR`, `timeout DURATION`) used to hide gh
// from the command-position check, which skipped every gh policy. See shell-command-wrappers.mts.
describe('Codex hook gh policies behind command wrappers', () => {
  it.each([
    'env -C/tmp gh pr merge 1',
    'env --chdir=/tmp gh pr merge 1',
    'env --ch /tmp gh pr merge 1',
    'env -iC /tmp gh pr merge 1',
    'env -C /tmp -u X FOO=1 gh pr merge 1',
    'env -P /usr/bin gh pr merge 1',
    'env -a gh gh pr merge 1',
    'env --argv0 gh gh pr merge 1',
    'env --block-signal gh pr merge 1',
    'env --default-signal=INT gh pr merge 1',
    'env -uFOO --unset=BAR gh pr merge 1',
    'env - gh pr merge 1',
    'env -- gh pr merge 1',
    '/usr/bin/env -C /tmp gh pr merge 1',
    'timeout 5 gh pr merge 1',
    'timeout -s KILL 5 gh pr merge 1',
    'timeout --signal=KILL -k 1 5 gh pr merge 1',
    'timeout --preserve-status 5 gh pr merge 1',
    'nice gh pr merge 1',
    'nice -n 5 gh pr merge 1',
    'nice -5 gh pr merge 1',
    'nice --adjustment=5 gh pr merge 1',
    'time -p gh pr merge 1',
    'time ! gh pr merge 1',
    'command -p gh pr merge 1',
    'builtin command gh pr merge 1',
    'command exec gh pr merge 1',
    'exec -a x env -C /tmp gh pr merge 1',
    'nohup env -C /tmp timeout 5 nice -n 5 gh pr merge 1',
    'echo 1 | xargs gh pr merge',
    'echo 1 | xargs -n 1 -P 4 gh pr merge',
    'echo 1 | xargs -I {} gh pr merge {}',
    '2>/dev/null gh pr merge 1',
    'env -C /tmp 2>/dev/null gh pr merge 1',
    'FOO=1 >out timeout 5 </dev/null gh pr merge 1',
    '2>&1 nohup gh pr merge 1',
  ])('blocks a merge behind a wrapper or redirection: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each([
    'f() { gh pr merge 1; }; f',
    'function f { gh pr merge 1; }; f',
    '{ gh pr merge 1; }',
    'if true; then :; else gh pr merge 1; fi',
    'while true; do gh pr merge 1; done',
    'coproc gh pr merge 1',
    '! gh pr merge 1',
  ])('blocks a merge inside a shell compound command or function: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each([
    'eval "gh pr merge 1"',
    "eval 'gh pr merge 1'",
    'eval gh pr merge 1',
    'eval -- "gh pr merge 1"',
    'env -S "gh pr merge 1"',
    'env -S"gh pr merge 1"',
    'env --split-string="gh pr merge 1"',
    'env -P /usr/bin -i --unset=X -S "gh pr merge" "$PR"',
    'env -S "-C /tmp gh pr merge 1"',
    '$(which gh) pr merge 1',
    '`which gh` pr merge 1',
    '"$(command -v gh)" pr merge 1',
    '"$(type -p gh)" pr merge 1',
    "timeout 5 bash <<'EOF'\ngh pr merge 1\nEOF",
    "env -C /tmp sh <<'EOF'\ngh pr merge 1\nEOF",
  ])('blocks a merge a wrapper runs from a string: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  // A definition's later use (`m 1`, `gh m 1`) cannot be tied back to it, so the definition
  // itself is gated as if it ran.
  it.each([
    'alias m="gh pr merge"',
    "gh alias set m 'pr merge'",
    "gh alias set --shell m 'gh pr merge 1'",
    "gh alias set m '!gh pr merge 1'",
  ])('blocks defining an alias that merges: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each([
    'echo 1 | xargs gh',
    'echo merge | xargs gh pr',
    'echo merge | xargs -I% gh pr % 1',
    'echo merge | xargs -i gh pr {} 1',
    'echo merge | xargs --replace gh pr {} 1',
    'echo 1 | xargs gh-stack',
    "echo merge | xargs -I{} sh -c 'gh pr {} 1'",
    "echo merge | xargs -I% bash -e -lc 'gh pr % 1'",
  ])('fails closed when xargs supplies the gh subcommand: %s', command => {
    expect(reasonFor(command)).toContain(XARGS_BLOCK)
  })

  it.each([
    'g() { gh "$@"; }; g pr merge 1',
    'gh "$@"',
    'gh $CMD',
    'gh "$AREA" merge 1',
    'gh pr "$ACTION" 1',
    'gh pr `echo merge` 1',
    'gh issue "$ACTION" --title t',
    'echo 1 | xargs sh -c \'gh pr "$1" 1\' _',
  ])('fails closed when a shell expansion supplies the gh subcommand: %s', command => {
    expect(reasonFor(command)).toContain(EXPANSION_BLOCK)
  })

  it.each([
    'gh alias import -',
    'gh alias import aliases.yml',
    'gh alias set m - < aliases.txt',
    'gh alias set --clobber m -',
  ])('fails closed on a gh alias expansion the hook cannot read: %s', command => {
    expect(reasonFor(command)).toContain(UNREADABLE_ALIAS_BLOCK)
  })

  it.each([
    'env -C /tmp gh pr create --title t --body "Closes #1"',
    'timeout 5 gh pr create --title t --body "Closes #1"',
  ])('requires draft PRs behind a wrapper: %s', command => {
    expect(reasonFor(command)).toContain('New PRs must be opened as draft first')
  })

  it('resolves closing refs from the env -C directory', () => {
    let resolverCwd: string | undefined
    const block = findGitHubWorkflowBlock(
      'env -C /other gh pr create --draft --title t --body "Closes #1"',
      '/session',
      {
        resolveClosingIssueReference: (_ref, cwd) => {
          resolverCwd = cwd
          return { issue: OPEN_ISSUE, ok: true }
        },
        validateClosingIssueReferences: true,
      },
    )
    expect(block).toBeNull()
    expect(resolverCwd).toBe('/other')
  })

  it('confirms a wrapped merge interactively and blocks it in automation', () => {
    const input = { tool_input: { command: 'env -C /tmp gh pr merge 1' } }
    expect(findPreToolUseBlock(input, { automationContext: false })?.disposition).toBe('confirm')
    expect(findPreToolUseBlock(input, { automationContext: true })?.disposition).toBe('block')
  })

  it.each([
    'echo gh pr merge 1',
    'git log --grep "gh pr merge"',
    'command -v gh pr merge 1',
    'command -V gh pr merge 1',
    // `gh` is the variable env unsets, the duration, or the niceness; the wrapper runs `pr`.
    'env -u gh pr merge 1',
    'timeout gh pr merge 1',
    'nice -n gh pr merge 1',
    'nohup ! gh pr merge 1',
    // `gh` is the redirection target; the shell runs `pr`.
    '>gh pr merge 1',
    'env 2> gh pr merge 1',
    'env -C /tmp gh pr view 1',
    'timeout 5 gh pr view 1',
    'echo 1 | xargs -n1 gh pr view',
    'eval echo gh pr merge 1',
    "gh alias set m 'pr view'",
    'gh alias list',
    "timeout 5 bash -c true <<'EOF'\ngh pr merge 1\nEOF",
    // Expansions outside the gh subcommand, and xargs filling only arguments or non-gh scripts.
    'gh pr view "$PR"',
    'gh api "repos/$REPO/pulls/1"',
    "echo 1 | xargs -I{} sh -c 'gh pr view {}'",
    "echo 1 | xargs -I{} sh -c 'echo {}'",
    'echo 1 | xargs -I{} sh ./script.sh {}',
    'echo 1 | xargs -I{} sh -c',
  ])('does not gate a command that runs no gh merge: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })
})
