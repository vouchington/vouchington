import { describe, expect, it } from 'vitest'

import {
  type ProvenanceDeps,
  renderProvenanceLines,
  resolveProvenance,
  resolveValidationBody,
} from '../provenance.mts'

function baseDeps(overrides: Partial<ProvenanceDeps> = {}): ProvenanceDeps {
  return {
    env: {},
    gitToplevel: () => Promise.resolve('/repo'),
    hostname: () => 'Host',
    isMainCheckout: () => Promise.resolve(true),
    resolveModel: () => Promise.resolve(undefined),
    username: () => 'user',
    ...overrides,
  }
}

describe('resolveProvenance — harness detection', () => {
  it('resolves to human when no harness env var is set', async () => {
    const result = await resolveProvenance(baseDeps())
    expect(result.agent).toBe('human')
  })

  it('never attempts model resolution for a human session', async () => {
    let called = false
    await resolveProvenance(
      baseDeps({
        resolveModel: () => {
          called = true
          return Promise.resolve('model')
        },
      }),
    )
    expect(called).toBe(false)
  })

  it('prefers Claude even when a Codex-shaped session id env var is also set', async () => {
    // Regression: CODEX_THREAD_ID (and legacy companion vars) can be set inside a real
    // Claude Code session too — Claude detection must always be checked first.
    const result = await resolveProvenance(
      baseDeps({ env: { CLAUDECODE: '1', CODEX_THREAD_ID: 'codexid123' } }),
    )
    expect(result.agent).toBe('claude-code')
  })

  it('detects Claude via CLAUDE_CODE_SESSION_ID alone, without CLAUDECODE set', async () => {
    const result = await resolveProvenance(baseDeps({ env: { CLAUDE_CODE_SESSION_ID: 'abc123' } }))
    expect(result.agent).toBe('claude-code session abc123')
  })

  it('detects Codex via CODEX_THREAD_ID when no Claude env var is set', async () => {
    const result = await resolveProvenance(baseDeps({ env: { CODEX_THREAD_ID: 'thread123' } }))
    expect(result.agent).toBe('codex thread thread123')
  })

  it('drops an invalid CLAUDE_CODE_SESSION_ID but keeps the claude-code harness', async () => {
    const result = await resolveProvenance(
      baseDeps({ env: { CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'not a valid id!' } }),
    )
    expect(result.agent).toBe('claude-code')
  })

  it('drops an invalid CODEX_THREAD_ID but keeps the codex harness', async () => {
    const result = await resolveProvenance(baseDeps({ env: { CODEX_THREAD_ID: 'not/a valid/id' } }))
    expect(result.agent).toBe('codex')
  })

  it('detects Cursor via CURSOR_AGENT when no Claude or Codex env var is set', async () => {
    const result = await resolveProvenance(baseDeps({ env: { CURSOR_AGENT: '1' } }))
    expect(result.agent).toBe('cursor')
  })

  it('detects Cursor via CURSOR_SESSION_ID and includes the session id', async () => {
    const result = await resolveProvenance(baseDeps({ env: { CURSOR_SESSION_ID: 'cursor-sess' } }))
    expect(result.agent).toBe('cursor session cursor-sess')
  })

  it('detects Grok via GROK_AGENT when no Claude or Codex env var is set', async () => {
    const result = await resolveProvenance(baseDeps({ env: { GROK_AGENT: 'grok-build' } }))
    expect(result.agent).toBe('grok')
  })

  it('detects Grok via GROK_SESSION_ID and includes the session id', async () => {
    const result = await resolveProvenance(
      baseDeps({ env: { GROK_SESSION_ID: '01a00367-8c14-78c1-ae19-07352cae4b16' } }),
    )
    expect(result.agent).toBe('grok session 01a00367-8c14-78c1-ae19-07352cae4b16')
  })

  it('prefers Claude over Grok when both env families are set', async () => {
    const result = await resolveProvenance(
      baseDeps({
        env: { CLAUDE_CODE_SESSION_ID: 'abc123', GROK_SESSION_ID: 'grok-sess' },
      }),
    )
    expect(result.agent).toBe('claude-code session abc123')
  })
})

describe('resolveProvenance — Agent line degradation', () => {
  it('includes the resolved model in parentheses before the session id', async () => {
    const result = await resolveProvenance(
      baseDeps({
        env: { CLAUDE_CODE_SESSION_ID: 'abc123' },
        resolveModel: () => Promise.resolve('claude-sonnet-5'),
      }),
    )
    expect(result.agent).toBe('claude-code (claude-sonnet-5) session abc123')
  })

  it('degrades silently to no model when resolution throws', async () => {
    const result = await resolveProvenance(
      baseDeps({
        env: { CLAUDE_CODE_SESSION_ID: 'abc123' },
        resolveModel: () => Promise.reject(new Error('transcript moved')),
      }),
    )
    expect(result.agent).toBe('claude-code session abc123')
  })

  it('degrades silently to no model when resolution resolves undefined', async () => {
    const result = await resolveProvenance(
      baseDeps({
        env: { CODEX_THREAD_ID: 'thread123' },
        resolveModel: () => Promise.resolve(undefined),
      }),
    )
    expect(result.agent).toBe('codex thread thread123')
  })
})

describe('resolveProvenance — device', () => {
  it('joins username and lowercased hostname', async () => {
    const result = await resolveProvenance(
      baseDeps({ hostname: () => 'MyHost.Local', username: () => 'jong' }),
    )
    expect(result.device).toBe('jong@myhost.local')
  })
})

describe('resolveProvenance — worktree', () => {
  it('resolves to "main" for the main checkout', async () => {
    const result = await resolveProvenance(
      baseDeps({ isMainCheckout: () => Promise.resolve(true) }),
    )
    expect(result.worktree).toBe('main')
  })

  it('extracts the path segment after /worktrees/ for a linked worktree', async () => {
    const result = await resolveProvenance(
      baseDeps({
        gitToplevel: () => Promise.resolve('/Users/jong/repo/.claude/worktrees/my-feature'),
        isMainCheckout: () => Promise.resolve(false),
      }),
    )
    expect(result.worktree).toBe('my-feature')
  })

  it('falls back to the toplevel basename when no /worktrees/ marker is present', async () => {
    const result = await resolveProvenance(
      baseDeps({
        gitToplevel: () => Promise.resolve('/Users/jong/some-other-checkout'),
        isMainCheckout: () => Promise.resolve(false),
      }),
    )
    expect(result.worktree).toBe('some-other-checkout')
  })

  it('falls back to "main" when isMainCheckout rejects', async () => {
    const result = await resolveProvenance(
      baseDeps({ isMainCheckout: () => Promise.reject(new Error('not a git repo')) }),
    )
    expect(result.worktree).toBe('main')
  })

  it('falls back to "main" when gitToplevel rejects', async () => {
    const result = await resolveProvenance(
      baseDeps({
        gitToplevel: () => Promise.reject(new Error('git not found')),
        isMainCheckout: () => Promise.resolve(false),
      }),
    )
    expect(result.worktree).toBe('main')
  })
})

describe('resolveValidationBody', () => {
  it('returns a "pr"-sourced body unchanged, so a live body missing provenance can still fail', async () => {
    const body = '## Summary\n\nno provenance here\n'
    await expect(resolveValidationBody({ body, source: 'pr' })).resolves.toBe(body)
  })
})

describe('renderProvenanceLines', () => {
  it('renders the three lines in Agent, Device, Worktree order', () => {
    expect(renderProvenanceLines({ agent: 'human', device: 'a@b', worktree: 'main' })).toEqual([
      'Agent: human',
      'Device: a@b',
      'Worktree: main',
    ])
  })
})
