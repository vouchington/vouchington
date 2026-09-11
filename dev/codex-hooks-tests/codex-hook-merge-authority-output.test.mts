import { spawnSync } from 'node:child_process'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  isAutomationContext,
  preToolUseOutput,
  type PreToolUseRuntime,
} from '../codex-hooks/policy.mts'

// Unit coverage for the runtime-facing serialization: preToolUseOutput decides HOW a 'confirm'
// disposition is surfaced (Claude gets a silent "allow" — the human already made the merge
// decision by asking for it in their own message; Codex/unknown gets empty, relying on its own
// approval_policy). isAutomationContext decides the block/allow split itself. Both are pure
// functions taking an explicit env/options bag — no process.env reads here. See
// docs/development/merge-authority.md.
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

describe('preToolUseOutput — merge disposition serialization', () => {
  const mergePayload = { tool_input: { command: 'gh pr merge 123 --squash' } }

  it('blocks with {decision:"block"} in automation, regardless of runtime', () => {
    for (const runtime of ['claude', 'codex', undefined] as const) {
      const output = preToolUseOutput(mergePayload, { automationContext: true, runtime })
      expect(JSON.parse(output)).toEqual({
        decision: 'block',
        reason: expect.stringContaining('never delegated to an agent'),
      })
    }
  })

  it('allows silently when interactive and runtime is claude', () => {
    const output = preToolUseOutput(mergePayload, { automationContext: false, runtime: 'claude' })
    expect(JSON.parse(output)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: expect.stringContaining('human decision'),
      },
    })
  })

  it.each<[PreToolUseRuntime | undefined]>([['codex'], [undefined]])(
    'emits nothing when interactive and runtime is %s (relies on native approval)',
    runtime => {
      const output = preToolUseOutput(mergePayload, { automationContext: false, runtime })
      expect(output).toBe('')
    },
  )

  it('does not affect non-merge blocks, which stay {decision:"block"} in every context', () => {
    const forcePush = { tool_input: { command: 'git push --force origin main' } }
    for (const automationContext of [true, false]) {
      const output = preToolUseOutput(forcePush, { automationContext, runtime: 'claude' })
      expect(JSON.parse(output)).toEqual({
        decision: 'block',
        reason: expect.stringContaining('Force pushes are banned'),
      })
    }
  })
})

// Wired-hook smoke test: pipes a real merge payload through the actual entry script (not just the
// exported functions), with and without GITHUB_ACTIONS set, for both runtime args. Confirms the
// argv[2] runtime token and process.env are threaded correctly end to end — the layer the unit
// tests above intentionally bypass.
describe('pre-tool-use.mts — wired smoke test', () => {
  const entry = path.join(import.meta.dirname, '..', 'codex-hooks', 'pre-tool-use.mts')
  const payload = JSON.stringify({ tool_input: { command: 'gh pr merge 123 --squash' } })

  function run(runtime: 'claude' | 'codex', env: NodeJS.ProcessEnv) {
    const result = spawnSync('node', [entry, runtime], {
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    expect(result.error).toBeUndefined()
    return result.stdout
  }

  it('blocks in GitHub Actions for claude', () => {
    const output = run('claude', { GITHUB_ACTIONS: 'true', CI: undefined })
    expect(JSON.parse(output).decision).toBe('block')
  })

  it('blocks in GitHub Actions for codex', () => {
    const output = run('codex', { GITHUB_ACTIONS: 'true', CI: undefined })
    expect(JSON.parse(output).decision).toBe('block')
  })

  it('allows silently interactively for claude (no GITHUB_ACTIONS/CI)', () => {
    const output = run('claude', { GITHUB_ACTIONS: undefined, CI: undefined })
    expect(JSON.parse(output).hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('emits nothing interactively for codex (no GITHUB_ACTIONS/CI)', () => {
    const output = run('codex', { GITHUB_ACTIONS: undefined, CI: undefined })
    expect(output).toBe('')
  })
})
