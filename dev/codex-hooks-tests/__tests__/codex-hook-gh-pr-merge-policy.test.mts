import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

// "gh pr merge" is banned outright in automation — with or without --auto — because merge
// authority requires a contemporaneous human decision. These cases exercise the shell-parsing surfaces (quoting,
// comments, substitutions, heredocs, redirections, wrapper commands) that could otherwise hide a
// merge invocation from the hook; every one of them must still resolve to a block.
describe('Codex hook gh pr merge policy', () => {
  it.each([
    'gh pr merge 123',
    'gh pr merge 123 --squash',
    'gh pr merge 123 --merge',
    'gh pr merge 123 --rebase',
    'gh pr merge 123 --auto --squash',
    'gh pr merge 123 --squash --auto',
    'env GH_TOKEN=token gh pr merge 123 --squash',
    'GH_TOKEN=token gh pr merge 123 --squash',
    'command gh pr merge 123 --squash',
    'exec gh pr merge 123 --squash',
    'exec -a gh gh pr merge 123 --squash',
    'exec -c gh pr merge 123 --squash',
    'exec -l gh pr merge 123 --squash',
    'nohup gh pr merge 123 --squash',
    'env -C /tmp gh pr merge 1',
    'env --chdir /tmp gh pr merge 1',
    'env -u GH_TOKEN gh pr merge 1',
    'env --unset GH_TOKEN gh pr merge 1',
    'bash -lc "gh pr merge 123"',
    'bash -lc "gh pr merge 123 --squash"',
    "zsh -c 'gh pr merge 123 --squash'",
    'rtk gh pr merge 123',
    'rtk gh pr merge 123 --squash',
    'rtk gh pr merge 123 --auto --squash',
    'gh -R owner/repo pr merge 123',
    'gh --repo owner/repo pr merge 123',
    'gh --repo=owner/repo pr merge 123',
    'gh -Rowner/repo pr merge 123',
    'gh pr -R owner/repo merge 123',
    'gh -R owner/repo pr merge 123 --auto',
  ])('blocks an immediate or auto-armed merge: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it.each([
    'gh pr merge 123 > --auto',
    'gh pr merge 123 2> --auto',
    'gh pr merge 123 &>out --auto --squash',
    'gh pr merge 123 --body >out --auto',
  ])('blocks a merge regardless of shell redirections around it: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it('blocks immediate merges in ANSI-C quoted shell command arguments', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: String.raw`bash -lc $'gh pr merge 123\n'` },
      })?.reason,
    ).toContain('never delegated to an agent')
  })

  it('blocks a merge hidden after an unquoted shell comment on the same command', () => {
    expect(
      findPreToolUseBlock({ tool_input: { command: 'gh pr merge 123 # --auto' } })?.reason,
    ).toContain('never delegated to an agent')
  })

  it.each([
    'gh pr merge 123 "#" --auto',
    String.raw`gh pr merge 123 \# --auto`,
    'gh pr merge 123 ""#literal --auto',
  ])('blocks a merge with a quoted or escaped hash character (not a real comment): %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it('resumes inspection after an unquoted comment newline', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'echo safe # gh pr merge 123 --auto\ngh pr merge 456' },
      })?.reason,
    ).toContain('never delegated to an agent')
  })

  it.each([
    'echo safe # bash -lc "gh pr merge 123"',
    String.raw`echo safe # bash -lc $'gh pr merge 123'`,
  ])('ignores a nested shell command entirely inside an unquoted comment: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it('inspects a real nested shell command after a comment newline', () => {
    expect(
      findPreToolUseBlock({
        tool_input: {
          command: String.raw`echo safe # bash -lc $'gh pr merge 123 --auto'
bash -lc $'gh pr merge 456'`,
        },
      })?.reason,
    ).toContain('never delegated to an agent')
  })

  it.each([
    'echo $(gh pr merge 123 --squash)',
    'echo "$(gh pr merge 123 --squash)"',
    'echo `gh pr merge 123 --squash`',
    'echo "`gh pr merge 123 --squash`"',
    'echo `echo \\`gh pr merge 123 --squash\\``',
    'echo "$(printf \'%s\' "$(gh pr merge 123 --squash)")"',
    'echo $(gh pr merge 123 --auto --squash)',
    'echo "`gh pr merge 123 --auto --squash`"',
  ])('recursively blocks immediate or auto-armed merges in command substitutions: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it('ignores command substitutions entirely inside an unquoted comment', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'echo safe # echo "$(gh pr merge 123 --squash)"' },
      }),
    ).toBeNull()
  })

  it.each(["echo '$(gh pr merge 123 --squash)'", "echo '`gh pr merge 123 --squash`'"])(
    'does not block single-quoted (unexpanded) command-substitution text: %s',
    command => {
      expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
    },
  )

  it.each([
    String.raw`cat <<'EOF'
$(gh pr merge 123 --squash)
EOF`,
    String.raw`echo "$(cat <<'EOF'
$(gh pr merge 123 --squash)
EOF
)"`,
  ])('does not inspect substitutions in a quoted heredoc body: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it.each([
    String.raw`cat <<E'OF'
$(gh pr merge 123 --squash)
EOF`,
    String.raw`cat <<\EOF
$(gh pr merge 123 --squash)
EOF`,
  ])('treats any quoted heredoc delimiter character as disabling expansion: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })

  it.each([
    String.raw`cat <<E'OF'
safe
EOF
gh pr merge 123 --squash`,
    String.raw`cat <<\EOF
safe
EOF
gh pr merge 123 --squash`,
  ])('applies quote removal when matching a heredoc delimiter: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it.each([
    String.raw`cat <<EOF
$(gh pr merge 123 --squash)
EOF`,
    String.raw`echo "$(cat <<EOF
$(gh pr merge 123 --squash)
EOF
)"`,
  ])('inspects substitutions in an unquoted heredoc body: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })

  it('does not let a later, unrelated command clear an earlier immediate merge', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh pr merge 123 --squash; gh pr view 456' },
      })?.reason,
    ).toContain('never delegated to an agent')
  })

  it('applies the gh stack allowlist after env -C', () => {
    expect(
      findPreToolUseBlock({ tool_input: { command: 'env -C /tmp gh stack checkout 7' } })?.reason,
    ).toContain('gh stack allowlist is closed')
  })

  it('does not block unrelated gh pr subcommands', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'gh pr view 123 --json state' },
      }),
    ).toBeNull()
  })
})

// automationContext:false is interactive (a human running the session, not GitHub Actions). The
// merge is no longer a hard block there — it downgrades to a human confirmation. See
// docs/development/merge-authority.md for why this split is safe: automationContext defaults to
// true (block) everywhere above, so this is the only place merge stops being an unconditional
// block.
describe('Codex hook gh pr merge policy — interactive confirm', () => {
  it.each(['gh pr merge 123', 'gh pr merge 123 --squash', 'gh pr merge 123 --auto --squash'])(
    'confirms rather than blocks outside automation: %s',
    command => {
      const block = findPreToolUseBlock({ tool_input: { command } }, { automationContext: false })
      expect(block?.disposition).toBe('confirm')
      expect(block?.reason).toContain('human decision')
    },
  )

  it('still blocks with disposition "block" when automationContext is explicitly true', () => {
    const block = findPreToolUseBlock(
      { tool_input: { command: 'gh pr merge 123 --squash' } },
      { automationContext: true },
    )
    expect(block?.disposition).toBe('block')
    expect(block?.reason).toContain('never delegated to an agent')
  })

  it('defaults to blocking when automationContext is omitted', () => {
    const block = findPreToolUseBlock({
      tool_input: { command: 'gh pr merge 123 --squash' },
    })
    expect(block?.disposition).toBe('block')
  })
})

describe('Codex hook gh pr merge policy — heredoc-nested invocations', () => {
  it.each([
    "bash <<'EOF'\ngh pr merge 123 --squash\nEOF",
    "bash <<'EOF'\nfor i in 1; do gh pr merge 123 --squash; done\nEOF",
  ])('inspects gh merge inside a shell-executed heredoc: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'never delegated to an agent',
    )
  })
})
