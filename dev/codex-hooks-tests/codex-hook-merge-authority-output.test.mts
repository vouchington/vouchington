import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { PreToolUseRuntime } from '../codex-hooks/hook-payload.mts'
import {
  isAttendedClaudeSession,
  isAutomationContext,
  preToolUseOutput,
} from '../codex-hooks/policy.mts'

// Unit coverage for the runtime-facing serialization: preToolUseOutput decides HOW a 'confirm'
// disposition is surfaced (an attended Claude session gets a silent "allow" — the human already
// made the merge decision by asking for it in their own message; everything else gets empty,
// relying on the harness's own approval). isAutomationContext and isAttendedClaudeSession read
// the env. All are pure functions taking an explicit env/options bag — no process.env reads here.
// See docs/development/merge-authority.md.
describe('isAutomationContext', () => {
  it.each([{ GITHUB_ACTIONS: 'true' }, { CI: 'true' }, { GITHUB_ACTIONS: 'true', CI: 'true' }])(
    'is true when %o is set',
    env => {
      expect(isAutomationContext(env)).toBe(true)
    },
  )

  it.each([{}, { GITHUB_ACTIONS: 'false' }, { CI: '0' }, { GITHUB_ACTIONS: undefined }])(
    'is false when %o is set',
    env => {
      expect(isAutomationContext(env)).toBe(false)
    },
  )
})

describe('isAttendedClaudeSession', () => {
  it('is true only when CLAUDE_CODE_SESSION_ATTENDED is 1', () => {
    expect(isAttendedClaudeSession({ CLAUDE_CODE_SESSION_ATTENDED: '1' })).toBe(true)
  })

  it.each([{}, { CLAUDE_CODE_SESSION_ATTENDED: '0' }, { CLAUDE_CODE_SESSION_ATTENDED: 'true' }])(
    'is false when %o is set',
    env => {
      expect(isAttendedClaudeSession(env)).toBe(false)
    },
  )
})

const ATTENDED_CLAUDE = { attended: true, automationContext: false, runtime: 'claude' } as const

function output(command: string, options: Parameters<typeof preToolUseOutput>[1]) {
  return preToolUseOutput({ tool_input: { command } }, options)
}

describe('preToolUseOutput — merge disposition serialization', () => {
  const merge = 'gh pr merge 123 --squash'

  it('blocks with {decision:"block"} in automation, regardless of runtime or attended', () => {
    for (const runtime of ['claude', 'codex', undefined] as const) {
      expect(
        JSON.parse(output(merge, { attended: true, automationContext: true, runtime })),
      ).toEqual({
        decision: 'block',
        reason: expect.stringContaining('never delegated to an agent'),
      })
    }
  })

  it.each([
    merge,
    'gh pr merge',
    'gh stack merge 12 --squash',
    'gh-stack merge 12',
    'GH_REPO=owner/repo gh pr merge 1',
    'env GH_REPO=owner/repo gh pr merge 1',
  ])('allows a lone merge silently in an attended Claude session: %s', command => {
    expect(JSON.parse(output(command, ATTENDED_CLAUDE))).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: expect.stringContaining('human decision'),
      },
    })
  })

  it.each([{ attended: false }, { attended: undefined }])(
    'emits nothing for an unattended Claude session (%o)',
    ({ attended }) => {
      expect(output(merge, { attended, automationContext: false, runtime: 'claude' })).toBe('')
    },
  )

  it.each<[PreToolUseRuntime | undefined]>([['codex'], ['grok'], [undefined]])(
    'emits nothing when interactive and runtime is %s, even if attended is inherited',
    runtime => {
      expect(output(merge, { attended: true, automationContext: false, runtime })).toBe('')
    },
  )

  it.each([
    'cd /x && gh pr merge 1',
    'env -C /tmp gh pr merge 1',
    'gh pr merge 1 --subject "Fix #12"',
    'gh pr merge $PR',
    'gh stack merge --squash',
    'gh api -X PUT repos/owner/repo/pulls/1/merge',
    'gh pr view 1',
  ])('gives no allow to anything but one plain merge: %s', command => {
    expect(output(command, ATTENDED_CLAUDE)).not.toContain('permissionDecision')
  })

  it.each([
    ['gh pr merge 1 && git push --force origin main', 'Force pushes are banned'],
    ['git commit --no-verify -m x; gh pr merge 1', '--no-verify'],
    ['HUSKY=0 gh pr merge 1', 'HUSKY'],
    ['gh pr merge 1; gh pr create --title t --body x', 'draft'],
  ])('lets a block anywhere in the command beat the merge allow: %s', (command, reason) => {
    expect(JSON.parse(output(command, ATTENDED_CLAUDE))).toEqual({
      decision: 'block',
      reason: expect.stringContaining(reason),
    })
  })
})

// Wired-hook smoke test: pipes a real merge payload through the actual entry script (not just the
// exported functions), with and without GITHUB_ACTIONS and CLAUDE_CODE_SESSION_ATTENDED set, for
// both runtime args. Confirms the argv[2] runtime token and process.env are threaded correctly end
// to end — the layer the unit tests above intentionally bypass. Every case sets the attended
// variable explicitly, since a developer's own Claude session exports it to this test process.
describe('pre-tool-use.mts — wired smoke test', () => {
  const entry = path.join(import.meta.dirname, '..', 'codex-hooks', 'pre-tool-use.mts')
  const payload = JSON.stringify({ tool_input: { command: 'gh pr merge 123 --squash' } })
  const interactive = { GITHUB_ACTIONS: undefined, CI: undefined }

  function run(runtime: 'claude' | 'codex', env: NodeJS.ProcessEnv) {
    const result = spawnSync('node', [entry, runtime], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, GROK_SESSION_ID: undefined, GROK_HOOK_EVENT: undefined, ...env },
    })
    expect(result.error).toBeUndefined()
    return result.stdout
  }

  it.each(['claude', 'codex'] as const)('blocks in GitHub Actions for %s', runtime => {
    const output = run(runtime, {
      GITHUB_ACTIONS: 'true',
      CI: undefined,
      CLAUDE_CODE_SESSION_ATTENDED: '1',
    })
    expect(JSON.parse(output).decision).toBe('block')
  })

  it('allows silently for an attended interactive claude session', () => {
    const output = run('claude', { ...interactive, CLAUDE_CODE_SESSION_ATTENDED: '1' })
    expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it.each([undefined, '0'])(
    'emits nothing for claude when CLAUDE_CODE_SESSION_ATTENDED is %s',
    attended => {
      expect(run('claude', { ...interactive, CLAUDE_CODE_SESSION_ATTENDED: attended })).toBe('')
    },
  )

  it('emits nothing interactively for codex, even with the attended variable inherited', () => {
    expect(run('codex', { ...interactive, CLAUDE_CODE_SESSION_ATTENDED: '1' })).toBe('')
  })
})
