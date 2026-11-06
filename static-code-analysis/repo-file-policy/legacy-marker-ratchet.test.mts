import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { checkLegacyEditedInPlaceMarkerRatchet } from './edited-in-place-marker-guard.mts'

const marker = '-- edited-in-place: pre-launch, never deployed to production'
const retained = 'backend/data-stores/psql/migrations/fixture-retained.sql'
const removed = 'backend/data-stores/psql/migrations/fixture-removed.sql'
const added = 'backend/data-stores/psql/migrations/fixture-added.sql'

function git(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}
function directory(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  return root
}
function repository() {
  const root = directory('legacy-marker-ratchet-')
  git(root, 'init', '--quiet')
  git(root, 'config', 'user.email', 'fixture@example.test')
  git(root, 'config', 'user.name', 'Fixture')
  return root
}
function commit(root: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'fixture')
  return git(root, 'rev-parse', 'HEAD')
}
function errors(root: string, paths: string[], base: string) {
  const result: string[] = []
  checkLegacyEditedInPlaceMarkerRatchet(root, new Set(paths), result, base)
  return result
}

describe('legacy marker allowlist ratchet', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('allows retention and removal but rejects a new member even when HEAD has its marker', () => {
    const root = repository()
    const base = commit(root, { [retained]: marker, [removed]: marker })
    commit(root, { [added]: marker })
    expect(errors(root, [retained, removed], base)).toEqual([])
    expect(errors(root, [retained], base)).toEqual([])
    expect(errors(root, [retained, added], base)).toEqual([
      expect.stringContaining(`legacy edited-in-place marker allowlist cannot grow: ${added}`),
    ])
  })

  it('rejects reintroducing a member after a valid removal from the next base', () => {
    const root = repository()
    const original = commit(root, { [retained]: marker, [removed]: marker })
    const nextBase = commit(root, { [removed]: '-- marker removed' })
    expect(errors(root, [retained], original)).toEqual([])
    expect(errors(root, [retained, removed], nextBase)).toEqual([
      expect.stringContaining(`legacy edited-in-place marker allowlist cannot grow: ${removed}`),
    ])
  })

  it('accepts an available shallow base tree and fails closed when its history is missing', () => {
    const root = repository()
    commit(root, { [retained]: marker })
    const base = commit(root, { [added]: '-- current wording' })
    const topic = commit(root, { [removed]: '-- current wording' })
    const merge = git(
      root,
      'commit-tree',
      `${topic}^{tree}`,
      '-p',
      base,
      '-p',
      topic,
      '-m',
      'fixture merge',
    )
    git(root, 'branch', 'fixture-merge', merge)
    const shallow = directory('legacy-marker-shallow-')
    execFileSync('git', [
      'clone',
      '--quiet',
      '--no-local',
      '--depth=2',
      '--branch',
      'fixture-merge',
      root,
      shallow,
    ])
    expect(errors(shallow, [retained], base)).toEqual([])
    expect(errors(shallow, [retained], 'HEAD~2')).toEqual([
      expect.stringContaining('cannot read legacy marker comparison base HEAD~2'),
    ])
  })

  it('fails closed when CI omits its comparison base', () => {
    const root = repository()
    commit(root, { [retained]: marker })
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    vi.stubEnv('BASE_SHA', undefined)
    const result: string[] = []
    checkLegacyEditedInPlaceMarkerRatchet(root, new Set([retained]), result)
    expect(result).toEqual([expect.stringContaining('requires BASE_SHA in CI')])
  })

  it('requires exact marker lines in migration SQL paths at the base', () => {
    const root = repository()
    const base = commit(root, {
      [retained]: `${marker} extra`,
      [added]: ` ${marker}`,
      'backend/data-stores/psql/migrations/note.txt': marker,
    })
    expect(errors(root, [retained, added], base)).toHaveLength(2)
  })
})
