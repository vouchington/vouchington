import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function updateInput(value: unknown) {
  const root = mkdtempSync(join(tmpdir(), 'checkpoint-input-'))
  try {
    const file = join(root, 'comment.json')
    writeFileSync(file, JSON.stringify(value))
    return spawnSync(
      process.execPath,
      [resolve('ci/shepherd-checkpoint-cli.mts'), 'update', file],
      {
        encoding: 'utf8',
        env: { ...process.env, CHECKPOINT_STATUS: '' },
      },
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('checkpoint CLI JSON boundary', () => {
  it.each([
    null,
    { id: '1' },
    { id: 1, body: {} },
    { id: 1, user: { login: [] } },
    { id: 1, performed_via_github_app: { slug: false } },
  ])('rejects malformed comments before requesting update context: %j', value => {
    const result = updateInput(value)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Invalid GitHub comment input')
    expect(result.stdout).toBe('')
  })

  it('admits the GitHub comment shape before requiring update context', () => {
    const result = updateInput({
      id: 1,
      body: 'checkpoint',
      user: { login: 'bot', type: 'Bot' },
      performed_via_github_app: { slug: 'app' },
      created_at: '2025-01-01T00:00:00Z',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('CHECKPOINT_STATUS is required')
  })
})
