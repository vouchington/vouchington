import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

const MERGE_BLOCK = 'never delegated to an agent'
const UNRESOLVED_EVAL_BLOCK = "`eval`'s argument is a variable the hook cannot resolve"
const UNRESOLVED_VARIABLE_BLOCK = 'is a variable executable the hook cannot resolve'
const UNKNOWN_AREA_BLOCK = "is not one of gh's built-in top-level commands"
const EXPANDED_SUBCOMMAND_BLOCK = 'comes from a shell expansion'

function reasonFor(command: string): string | undefined {
  return findPreToolUseBlock({ tool_input: { command } })?.reason
}

function blockedFor(command: string): boolean {
  return findPreToolUseBlock({ tool_input: { command } }) !== null
}

// #436: a variable executable, `eval` of an expansion, and a gh alias/extension defined outside
// the inspected command used to reach no policy decision at all.
describe('Codex hook gh policies behind variable executables, eval and unknown gh areas', () => {
  it('resolves a literal same-command assignment before a variable executable', () => {
    expect(reasonFor('GH=gh; $GH pr merge 1')).toContain(MERGE_BLOCK)
    expect(reasonFor('export GH=gh; $GH pr merge 1')).toContain(MERGE_BLOCK)
  })

  it('does not block a resolved variable executable that satisfies the policy', () => {
    expect(blockedFor('export GH=gh; $GH pr create --draft')).toBe(false)
    expect(blockedFor('GH=gh; $GH pr view 1')).toBe(false)
  })

  it('quotes a resolved variable executable’s arguments so a quoted separator or # does not leak into the re-scan', () => {
    expect(blockedFor('GH=gh; $GH pr create --draft --title "x; gh pr merge 1"')).toBe(false)
    expect(blockedFor('GH=gh; $GH pr create --draft --body "Closes #12"')).toBe(false)
  })

  it('fails closed on a variable executable it cannot resolve, next to a gh area word', () => {
    expect(reasonFor('$CMD pr merge 1')).toContain(UNRESOLVED_VARIABLE_BLOCK)
    expect(reasonFor('$GH issue close 1')).toContain(UNRESOLVED_VARIABLE_BLOCK)
  })

  it("fails closed past gh's own -R/--repo flag before the area word", () => {
    expect(reasonFor('$GH -R owner/repo pr merge 1')).toContain(UNRESOLVED_VARIABLE_BLOCK)
  })

  it.each([
    '$EDITOR file',
    '"$cmd" args',
    '$HOME/bin/deploy',
    '$DOCKER run --rm image',
    '"$PYTHON" --version',
    '$GIT status',
    '$npm run build',
  ])('does not gate an ordinary variable executable: %s', command => {
    expect(blockedFor(command)).toBe(false)
  })

  it('resolves a literal same-command assignment before eval', () => {
    expect(reasonFor('CMD="gh pr merge 1"; eval "$CMD"')).toContain(MERGE_BLOCK)
  })

  it('fails closed on eval of an unresolved bare parameter expansion', () => {
    expect(reasonFor('eval "$CMD"')).toContain(UNRESOLVED_EVAL_BLOCK)
    expect(reasonFor('eval $CMD')).toContain(UNRESOLVED_EVAL_BLOCK)
  })

  it('does not gate eval of a command substitution', () => {
    expect(blockedFor('eval "$(mise activate zsh)"')).toBe(false)
  })

  it('checks a literal eval argument with an unresolved positional parameter as its own command', () => {
    expect(reasonFor('eval "gh pr merge $1"')).toContain(MERGE_BLOCK)
  })

  it('checks a literal eval argument with a trailing expansion as its own command', () => {
    expect(reasonFor('eval gh "$SUB"')).toContain(EXPANDED_SUBCOMMAND_BLOCK)
  })

  it('fails closed on a gh area outside gh’s built-in set', () => {
    expect(reasonFor('gh m 1')).toContain(UNKNOWN_AREA_BLOCK)
  })

  it('does not treat an inline-defined gh alias name as an unknown area', () => {
    expect(blockedFor("gh alias set v 'pr view'; gh v 1")).toBe(false)
  })

  it('still applies the merge policy through an inline-defined gh alias', () => {
    expect(reasonFor("gh alias set m 'pr merge'; gh m 1")).toContain(MERGE_BLOCK)
  })

  it.each(['gh reference commands', 'gh at verify x', 'gh stack view', 'gh --help pr'])(
    'does not gate a real gh area or help topic: %s',
    command => {
      expect(blockedFor(command)).toBe(false)
    },
  )
})
