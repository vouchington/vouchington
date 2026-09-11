import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { claudeProjectCwdResolver, readTranscriptCwd } from '../transcript-cwd.mts'

describe('readTranscriptCwd', () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('extracts a top-level cwd from a Claude-style record', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const path = join(root, 'session.jsonl')
    writeFileSync(path, `${JSON.stringify({ type: 'assistant', cwd: '/repo/root' })}\n`)
    await expect(readTranscriptCwd(path)).resolves.toBe('/repo/root')
  })

  it('extracts payload.cwd from a Codex session_meta record', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const path = join(root, 'rollout.jsonl')
    writeFileSync(
      path,
      `${JSON.stringify({ type: 'session_meta', payload: { id: 'x', cwd: '/repo/root' } })}\n`,
    )
    await expect(readTranscriptCwd(path)).resolves.toBe('/repo/root')
  })

  it('returns undefined when no line carries a cwd', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const path = join(root, 'no-cwd.jsonl')
    writeFileSync(path, `${JSON.stringify({ type: 'assistant', message: { content: [] } })}\n`)
    await expect(readTranscriptCwd(path)).resolves.toBeUndefined()
  })

  it('escalates to a full read when the cwd line sits past the 64 KB prefix boundary', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const path = join(root, 'large.jsonl')
    // A single line larger than the 64 KB prefix, with no cwd, followed by the real
    // cwd-bearing line — the prefix read lands mid-way through line one, drops that
    // incomplete fragment, finds nothing, and must escalate to a full-file read.
    const padding = 'x'.repeat(70 * 1024)
    const noCwdLine = JSON.stringify({ type: 'assistant', note: padding })
    const cwdLine = JSON.stringify({ type: 'assistant', cwd: '/past/boundary' })
    writeFileSync(path, `${noCwdLine}\n${cwdLine}\n`)
    await expect(readTranscriptCwd(path)).resolves.toBe('/past/boundary')
  })
})

describe('claudeProjectCwdResolver', () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it('resolves via a top-level session file in the same project directory', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const projectDir = join(projectsDir, 'proj-a')
    mkdirSync(projectDir, { recursive: true })
    const sessionFile = join(projectDir, 'session-1.jsonl')
    writeFileSync(sessionFile, `${JSON.stringify({ cwd: '/repo/root' })}\n`)

    const resolveCwd = claudeProjectCwdResolver(projectsDir)
    await expect(resolveCwd(sessionFile)).resolves.toBe('/repo/root')
  })

  it('proxies a subagent transcript to its project directory cwd, even without its own cwd field', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const projectDir = join(projectsDir, 'proj-a')
    const subagentsDir = join(projectDir, 'session-1', 'subagents')
    mkdirSync(subagentsDir, { recursive: true })
    writeFileSync(join(projectDir, 'session-1.jsonl'), `${JSON.stringify({ cwd: '/repo/root' })}\n`)
    const subagentFile = join(subagentsDir, 'agent-1.jsonl')
    writeFileSync(subagentFile, `${JSON.stringify({ type: 'assistant', message: {} })}\n`)

    const resolveCwd = claudeProjectCwdResolver(projectsDir)
    await expect(resolveCwd(subagentFile)).resolves.toBe('/repo/root')
  })

  it('memoizes cwd resolution per project directory instead of re-globbing every file', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const projectDir = join(projectsDir, 'proj-a')
    mkdirSync(projectDir, { recursive: true })
    const sessionFile = join(projectDir, 'session-1.jsonl')
    writeFileSync(sessionFile, `${JSON.stringify({ cwd: '/repo/root' })}\n`)

    const resolveCwd = claudeProjectCwdResolver(projectsDir)
    await expect(resolveCwd(sessionFile)).resolves.toBe('/repo/root')

    // Remove the only real file in the project directory. A second lookup for a
    // different (even nonexistent) path in the same project dir must still resolve
    // correctly — proof the second call reused the memoized promise rather than
    // re-globbing (a fresh glob here would find nothing and return undefined).
    rmSync(sessionFile)
    const otherPath = join(projectDir, 'session-1', 'subagents', 'agent-1.jsonl')
    await expect(resolveCwd(otherPath)).resolves.toBe('/repo/root')
  })

  it('returns undefined when the project directory has no cwd-bearing file', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const projectDir = join(projectsDir, 'proj-a')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'session-1.jsonl'), `${JSON.stringify({ type: 'assistant' })}\n`)

    const resolveCwd = claudeProjectCwdResolver(projectsDir)
    await expect(resolveCwd(join(projectDir, 'session-1.jsonl'))).resolves.toBeUndefined()
  })

  it('keys memoization off the path segment directly under projectsDir, not the full path', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const projectsDir = join(root, 'claude-projects')
    mkdirSync(join(projectsDir, 'proj-a'), { recursive: true })
    mkdirSync(join(projectsDir, 'proj-b'), { recursive: true })
    writeFileSync(
      join(projectsDir, 'proj-a', 'session-1.jsonl'),
      `${JSON.stringify({ cwd: '/repo/a' })}\n`,
    )
    writeFileSync(
      join(projectsDir, 'proj-b', 'session-1.jsonl'),
      `${JSON.stringify({ cwd: '/repo/b' })}\n`,
    )

    const resolveCwd = claudeProjectCwdResolver(projectsDir)
    await expect(resolveCwd(join(projectsDir, 'proj-a', 'session-1.jsonl'))).resolves.toBe(
      '/repo/a',
    )
    await expect(resolveCwd(join(projectsDir, 'proj-b', 'session-1.jsonl'))).resolves.toBe(
      '/repo/b',
    )
  })

  it('retries after a rejected resolution instead of permanently caching the rejection', async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
    const projectsDir = join(root, 'claude-projects')
    const projectDir = join(projectsDir, 'proj-a')
    mkdirSync(projectDir, { recursive: true })
    // A symlink whose target doesn't exist: readTranscriptCwd's open() rejects with
    // ENOENT, so resolveProjectCwd's un-caught loop rejects too.
    const brokenPath = join(projectDir, 'broken.jsonl')
    symlinkSync(join(root, 'does-not-exist.jsonl'), brokenPath)

    const resolveCwd = claudeProjectCwdResolver(projectsDir)
    await expect(resolveCwd(brokenPath)).rejects.toThrow(/ENOENT/)

    // Replace the broken entry with a real cwd-bearing session file. A poisoned cache
    // (the rejected promise kept forever) would still reject here instead of re-globbing.
    rmSync(brokenPath)
    writeFileSync(join(projectDir, 'session-1.jsonl'), `${JSON.stringify({ cwd: '/repo/root' })}\n`)
    await expect(resolveCwd(brokenPath)).resolves.toBe('/repo/root')
  })
})
