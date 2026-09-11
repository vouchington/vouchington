import { describe, expect, it } from 'vitest'

import { injectProvenance } from '../provenance-inject.mts'

const LINES = ['Agent: human', 'Device: test@test-host', 'Worktree: test-worktree']

describe('injectProvenance', () => {
  it('splices all three lines immediately after Workspace setup: when none are present', () => {
    const body = '## Related issues\n\nCloses #1\n\nWorkspace setup: ./dev/initialize monorepo\n'
    const result = injectProvenance(body, LINES)
    expect(result).toBe(
      '## Related issues\n\nCloses #1\n\nWorkspace setup: ./dev/initialize monorepo\n' +
        'Agent: human\nDevice: test@test-host\nWorktree: test-worktree\n',
    )
  })

  it('is idempotent when the full block is already present', () => {
    const body =
      'Workspace setup: ./dev/initialize monorepo\n' +
      'Agent: human\nDevice: test@test-host\nWorktree: test-worktree\n'
    expect(injectProvenance(body, LINES)).toBe(body)
  })

  it('backfills only missing keys, preserving existing values verbatim', () => {
    const body = 'Workspace setup: ./dev/initialize monorepo\nAgent: codex thread abc123\n'
    const result = injectProvenance(body, LINES)
    expect(result).toBe(
      'Workspace setup: ./dev/initialize monorepo\n' +
        'Agent: codex thread abc123\nDevice: test@test-host\nWorktree: test-worktree\n',
    )
  })

  it('backfills multiple missing keys in fixed Agent, Device, Worktree order', () => {
    // Device already exists mid-block; Agent and Worktree are both missing and must land in
    // canonical order after it, not in the order the caller happened to list `lines`.
    const body = 'Workspace setup: none\nDevice: test@test-host\n'
    const result = injectProvenance(body, LINES)
    expect(result).toBe(
      'Workspace setup: none\nDevice: test@test-host\nAgent: human\nWorktree: test-worktree\n',
    )
  })

  it('leaves an out-of-order but complete existing block untouched', () => {
    const body =
      'Workspace setup: none\nWorktree: test-worktree\nDevice: test@test-host\nAgent: human\n'
    expect(injectProvenance(body, LINES)).toBe(body)
  })

  it('appends at the end when no Workspace setup: line exists', () => {
    const body = '## Summary\n\nNo workspace line here.\n'
    const result = injectProvenance(body, LINES)
    expect(result).toBe(
      '## Summary\n\nNo workspace line here.\nAgent: human\nDevice: test@test-host\nWorktree: test-worktree',
    )
  })

  it('appends at the end without a trailing blank line when the body has none', () => {
    const body = '## Summary\n\nNo trailing newline'
    const result = injectProvenance(body, LINES)
    expect(result).toBe(
      '## Summary\n\nNo trailing newline\nAgent: human\nDevice: test@test-host\nWorktree: test-worktree',
    )
  })

  it('anchors on the last Workspace setup: line when more than one is present', () => {
    const body =
      '```text\nWorkspace setup: example only\n```\n\nWorkspace setup: ./dev/initialize monorepo\n'
    const result = injectProvenance(body, LINES)
    expect(result).toBe(
      '```text\nWorkspace setup: example only\n```\n\n' +
        'Workspace setup: ./dev/initialize monorepo\n' +
        'Agent: human\nDevice: test@test-host\nWorktree: test-worktree\n',
    )
  })

  it('stops the existing-block scan at the first non-provenance line', () => {
    const body = 'Workspace setup: none\nAgent: human\n\nDevice: test@test-host\n'
    const result = injectProvenance(body, LINES)
    // The blank line after `Agent:` ends the contiguous block, so Device/Worktree are
    // backfilled right after Agent — the later, non-contiguous `Device:` line is left alone.
    expect(result).toBe(
      'Workspace setup: none\nAgent: human\nDevice: test@test-host\nWorktree: test-worktree\n\nDevice: test@test-host\n',
    )
  })
})
