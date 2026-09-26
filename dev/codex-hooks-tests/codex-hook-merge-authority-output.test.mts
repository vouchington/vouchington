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
// made the merge decision by asking for it in their own message; everything else gets no opinion,
// relying on the harness's own approval) and how a block exits (2, reason on stderr and stdout).
// isAutomationContext and isAttendedClaudeSession read the env. All are pure functions taking an
// explicit env/options bag — no process.env reads here. See docs/development/merge-authority.md.
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
const NO_OPINION = { exitCode: 0, stderr: '', stdout: '' }
const HOOK_BYPASS_COMMAND = 'HUSKY=0 true'

function output(command: string, options: Parameters<typeof preToolUseOutput>[1]) {
  return preToolUseOutput({ tool_input: { command } }, options)
}

// A block's stdout is JSON; parse it so one toEqual covers the exit code and both streams.
function parsed(result: { exitCode: number | null; stderr: string; stdout: string }) {
  return { ...result, stdout: JSON.parse(result.stdout) as unknown }
}

function block(reason: string) {
  return {
    exitCode: 2,
    stderr: expect.stringContaining(reason),
    stdout: { decision: 'deny', reason: expect.stringContaining(reason) },
  }
}

describe('preToolUseOutput — merge disposition serialization', () => {
  const merge = 'gh pr merge 123 --squash'

  it.each<[PreToolUseRuntime | undefined]>([
    ['claude'],
    ['codex'],
    ['cursor'],
    ['grok'],
    [undefined],
  ])('exits 2 with the reason in automation for runtime %s, even if attended', runtime => {
    expect(parsed(output(merge, { attended: true, automationContext: true, runtime }))).toEqual(
      block('never delegated to an agent'),
    )
  })

  it.each([
    merge,
    'gh pr merge',
    'gh stack merge 12 --squash',
    'gh-stack merge 12',
    'GH_REPO=owner/repo gh pr merge 1',
    'env GH_REPO=owner/repo gh pr merge 1',
  ])('allows a lone merge silently in an attended Claude session: %s', command => {
    const result = output(command, ATTENDED_CLAUDE)
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: expect.stringContaining('human decision'),
      },
    })
  })

  it.each([{ attended: false }, { attended: undefined }])(
    'gives no opinion for an unattended Claude session (%o)',
    ({ attended }) => {
      expect(output(merge, { attended, automationContext: false, runtime: 'claude' })).toEqual(
        NO_OPINION,
      )
    },
  )

  it.each<[PreToolUseRuntime | undefined]>([['codex'], ['cursor'], ['grok'], [undefined]])(
    'gives no opinion when interactive and runtime is %s, even if attended is inherited',
    runtime => {
      expect(output(merge, { attended: true, automationContext: false, runtime })).toEqual(
        NO_OPINION,
      )
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
    expect(output(command, ATTENDED_CLAUDE).stdout).not.toContain('permissionDecision')
  })

  it.each([
    ['gh pr merge 1 && git push --force origin main', 'Force pushes are banned'],
    ['git commit --no-verify -m x; gh pr merge 1', '--no-verify'],
    ['HUSKY=0 gh pr merge 1', 'HUSKY'],
    ['gh pr merge 1; gh pr create --title t --body x', 'draft'],
  ])('lets a block anywhere in the command beat the merge allow: %s', (command, reason) => {
    expect(parsed(output(command, ATTENDED_CLAUDE))).toEqual(block(reason))
  })
})

// Wired-hook smoke test: pipes a real payload through the actual entry script (not just the
// exported functions) and asserts the exit code and both streams, since exit 2 is the block every
// runtime honors. Confirms the argv[2] runtime token, the Cursor/Grok detection, and process.env
// are threaded correctly end to end — the layer the unit tests above intentionally bypass. Every
// case clears the harness markers first, since a developer's own session exports them to this test
// process.
describe('pre-tool-use.mts — wired smoke test', () => {
  const entry = path.join(import.meta.dirname, '..', 'codex-hooks', 'pre-tool-use.mts')
  const mergePayload = { tool_input: { command: 'gh pr merge 123 --squash' } }
  const interactive = { GITHUB_ACTIONS: undefined, CI: undefined }
  const attended = { ...interactive, CLAUDE_CODE_SESSION_ATTENDED: '1' }

  function run(
    runtime: 'claude' | 'codex',
    env: NodeJS.ProcessEnv,
    payload: object = mergePayload,
  ) {
    const result = spawnSync('node', [entry, runtime], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: {
        ...process.env,
        CURSOR_PROJECT_DIR: undefined,
        CURSOR_VERSION: undefined,
        GROK_HOOK_EVENT: undefined,
        GROK_SESSION_ID: undefined,
        ...env,
      },
    })
    expect(result.error).toBeUndefined()
    return { exitCode: result.status, stderr: result.stderr, stdout: result.stdout }
  }

  it.each(['claude', 'codex'] as const)('exits 2 in GitHub Actions for %s', runtime => {
    expect(
      parsed(
        run(runtime, { GITHUB_ACTIONS: 'true', CI: undefined, CLAUDE_CODE_SESSION_ATTENDED: '1' }),
      ),
    ).toEqual(block('never delegated to an agent'))
  })

  it.each(['claude', 'codex'] as const)('exits 2 for a hook bypass in %s', runtime => {
    expect(
      parsed(run(runtime, interactive, { tool_input: { command: HOOK_BYPASS_COMMAND } })),
    ).toEqual(block('HUSKY'))
  })

  it('allows silently for an attended interactive claude session', () => {
    const result = run('claude', attended)
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it.each([undefined, '0'])(
    'gives no opinion for claude when CLAUDE_CODE_SESSION_ATTENDED is %s',
    value => {
      expect(run('claude', { ...interactive, CLAUDE_CODE_SESSION_ATTENDED: value })).toEqual(
        NO_OPINION,
      )
    },
  )

  it('gives no opinion interactively for codex, even with the attended variable inherited', () => {
    expect(run('codex', attended)).toEqual(NO_OPINION)
  })

  it.each([
    ['CURSOR_VERSION env', { CURSOR_VERSION: 'present' }, mergePayload],
    ['CURSOR_PROJECT_DIR env', { CURSOR_PROJECT_DIR: '/repo' }, mergePayload],
    ['cursor_version payload key', {}, { ...mergePayload, cursor_version: 'present' }],
  ])('gives Cursor no allow when it inherits the attended Claude env (%s)', (_, env, payload) => {
    expect(run('claude', { ...attended, ...env }, payload)).toEqual(NO_OPINION)
  })

  it('blocks a Cursor Shell payload', () => {
    expect(
      parsed(
        run(
          'claude',
          { ...attended, CURSOR_VERSION: 'present' },
          {
            cursor_version: 'present',
            tool_input: { command: HOOK_BYPASS_COMMAND },
            tool_name: 'Shell',
          },
        ),
      ),
    ).toEqual(block('HUSKY'))
  })

  it('gives no opinion for a plain command', () => {
    expect(run('claude', attended, { tool_input: { command: 'git status' } })).toEqual(NO_OPINION)
  })
})
