import { describe, expect, it } from 'vitest'
import { findPreToolUseBlock } from '../codex-hooks/policy.mts'

const PROTECTED_TOKENS = [
  'dev/codex-hooks/policy.mts',
  'dev/codex-hooks/pre-tool-use.mts',
  'dev/agent-session-id/persist.mts',
  'dev/pr-description/closing-refs.mts',
  'dev/plan-issue/validate.mts',
  '.codex/config.toml',
  '.codex/rules/default.rules',
  '.cursor/hooks.json',
  '.cursor/permissions.json',
  '.cursor/sandbox.json',
  '.cursor/worktrees.json',
  '.grok/hooks/pre-tool-use.mts',
]

describe('Codex hook protected-hook-paths policy (#8009 finding 2)', () => {
  it.each(PROTECTED_TOKENS)('blocks Bash commands referencing %s in automation', protectedPath => {
    expect(
      findPreToolUseBlock(
        { tool_input: { command: `sed -n 1,5p ${protectedPath}` } },
        { automationContext: true },
      )?.reason,
    ).toContain('#8009')
  })

  it.each(PROTECTED_TOKENS)('blocks Edit/Write file_path %s in automation', protectedPath => {
    expect(
      findPreToolUseBlock(
        { tool_input: { file_path: protectedPath, old_string: 'a', new_string: 'b' } },
        { automationContext: true },
      )?.reason,
    ).toContain('#8009')
  })

  it.each(PROTECTED_TOKENS)(
    'blocks apply_patch headers touching %s in automation',
    protectedPath => {
      expect(
        findPreToolUseBlock(
          {
            tool_input: {
              command: `*** Begin Patch\n*** Update File: ${protectedPath}\n*** End Patch`,
            },
          },
          { automationContext: true },
        )?.reason,
      ).toContain('#8009')
    },
  )

  it('blocks MultiEdit-style nested file_path entries in automation', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            edits: [{ file_path: 'dev/codex-hooks/policy/protected-hook-paths.mts' }],
          },
        },
        { automationContext: true },
      )?.reason,
    ).toContain('#8009')
  })

  it('allows the same edits when not running in automation (interactive session)', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: { file_path: 'dev/codex-hooks/policy.mts', old_string: 'a', new_string: 'b' },
        },
        { automationContext: false },
      ),
    ).toBeNull()
  })

  it('blocks by default when automationContext is omitted (fail closed)', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { file_path: '.codex/config.toml', old_string: 'a', new_string: 'b' },
      })?.reason,
    ).toContain('#8009')
  })

  it('does not block ordinary files outside the protected set', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            file_path: 'backend/api/routes/example.ts',
            old_string: 'a',
            new_string: 'b',
          },
        },
        { automationContext: true },
      ),
    ).toBeNull()
  })

  it('does not false-positive on dev/codex-hooks-tests/ (sibling dir, not a subpath)', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            file_path: 'dev/codex-hooks-tests/codex-hook-claire-path-policy.test.mts',
            old_string: 'a',
            new_string: 'b',
          },
        },
        { automationContext: true },
      ),
    ).toBeNull()
  })

  it('does not false-positive on .codex/agents/ (deliberately unprotected)', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: { file_path: '.codex/agents/reviewer.md', old_string: 'a', new_string: 'b' },
        },
        { automationContext: true },
      ),
    ).toBeNull()
  })

  it('blocks a no-space redirect writing a protected path (Codex review finding)', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            command: 'git show HEAD:malicious.mts >dev/codex-hooks/policy.mts',
          },
        },
        { automationContext: true },
      )?.reason,
    ).toContain('#8009')
  })

  it('blocks a command referencing a protected path with redundant dot segments', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: { command: 'git checkout HEAD -- dev/./codex-hooks/policy.mts' },
        },
        { automationContext: true },
      )?.reason,
    ).toContain('#8009')
  })

  it('does not block apply_patch body text merely mentioning a protected path', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            command:
              '*** Begin Patch\n*** Update File: docs/development/ci.md\n' +
              '@@\n-old\n+This gate protects dev/codex-hooks/** from mid-session edits.\n' +
              '*** End Patch',
          },
        },
        { automationContext: true },
      ),
    ).toBeNull()
  })

  it('still blocks apply_patch Move to: headers renaming into a protected path', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            command:
              '*** Begin Patch\n*** Update File: docs/development/ci.md\n' +
              '*** Move to: dev/codex-hooks/renamed.mts\n@@\n*** End Patch',
          },
        },
        { automationContext: true },
      )?.reason,
    ).toContain('#8009')
  })

  it(
    'does not resolve a cd-plus-relative-path indirection (documented limitation, not a ' +
      'regression)',
    () => {
      // cwd is not threaded into this check — payload-string inspection can't see that a prior
      // `cd dev &&` changed the effective root for this token. See docs/development/ci.md's
      // "Mid-session mutation" section, which discloses this as a known, deliberate gap.
      expect(
        findPreToolUseBlock(
          {
            tool_input: { command: 'cd dev && git checkout HEAD -- codex-hooks/policy.mts' },
          },
          { automationContext: true },
        ),
      ).toBeNull()
    },
  )

  it('does not false-positive on plain text content merely mentioning a protected path', () => {
    expect(
      findPreToolUseBlock(
        {
          tool_input: {
            file_path: 'docs/development/ci.md',
            old_string: 'old text',
            new_string: 'This gate protects dev/codex-hooks/** from mid-session edits.',
          },
        },
        { automationContext: true },
      ),
    ).toBeNull()
  })
})
