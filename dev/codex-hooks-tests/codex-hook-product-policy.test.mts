import { describe, expect, it } from 'vitest'
import { evaluateCommandPolicy } from 'vouchington-tooling/command-policy'

import policy from '../codex-hooks/policy.mts'

const evaluate = (payload: Record<string, unknown>, automationContext = false) =>
  evaluateCommandPolicy(payload, policy.command, { automationContext, cwd: process.cwd() })

describe('Voucha command policy configuration', () => {
  it('keeps local hook bypass, dev server, and rebase guidance', () => {
    expect(evaluate({ command: 'HUSKY=0 git status' })?.reason).toContain('HUSKY=0')
    expect(evaluate({ command: 'pnpm run dev' })?.reason).toContain('./dev/tmux')
    expect(evaluate({ command: 'git pull --rebase origin main' })?.reason).toContain(
      './dev/rebase-onto-main',
    )
    expect(evaluate({ command: 'git status --short' })).toBeNull()
  })

  it('protects the local hook and enforces the main-based stack', () => {
    const edit = { tool_name: 'Edit', tool_input: { file_path: 'dev/codex-hooks/policy.mts' } }
    expect(evaluate(edit, true)?.reason).toContain('permission-enforcement hooks')
    expect(evaluate(edit)).toBeNull()
    expect(evaluate({ command: 'gh stack init feature --base other' })?.reason).toContain('main')
  })
})
