import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

const script = join(process.cwd(), 'ci/verify-main-ancestor.sh')

function git(repository: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
}

function repository(): string {
  const directory = mkdtempSync(join(tmpdir(), 'image-main-ancestor-'))
  onTestFinished(() => rmSync(directory, { force: true, recursive: true }))
  git(directory, 'init', '--quiet', '--initial-branch=main')
  git(directory, 'config', 'user.email', 'image-promotion@example.invalid')
  git(directory, 'config', 'user.name', 'Image Promotion Test')
  return directory
}

function commit(directory: string, content: string): string {
  writeFileSync(join(directory, 'fixture'), content)
  git(directory, 'add', 'fixture')
  git(directory, 'commit', '--quiet', '-m', content)
  return git(directory, 'rev-parse', 'HEAD')
}

function verify(directory: string, sourceSha: string) {
  const output = join(directory, 'github-output')
  const result = spawnSync('bash', [script], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: output, SOURCE_SHA: sourceSha },
  })
  return {
    ...result,
    output: result.status === 0 ? readFileSync(output, 'utf8') : '',
  }
}

describe('main image source ancestry proof', () => {
  it('emits the exact checked-out source and pinned origin/main tip after every proof passes', () => {
    const directory = repository()
    commit(directory, 'base')
    const sourceSha = commit(directory, 'source')
    git(directory, 'update-ref', 'refs/remotes/origin/main', sourceSha)

    const result = verify(directory, sourceSha)

    expect(result.status).toBe(0)
    expect(result.output).toBe(`source_sha=${sourceSha}\nmain_tip=${sourceSha}\n`)
  })

  it('rejects a source other than the exact checked-out HEAD without emitting proof', () => {
    const directory = repository()
    const sourceSha = commit(directory, 'source')
    const mainTip = commit(directory, 'later')
    git(directory, 'update-ref', 'refs/remotes/origin/main', mainTip)

    const result = verify(directory, sourceSha)

    expect(result.status).not.toBe(0)
    expect(result.output).toBe('')
  })

  it('rejects an exact checked-out commit that is not reachable from pinned origin/main', () => {
    const directory = repository()
    const mainTip = commit(directory, 'main')
    git(directory, 'update-ref', 'refs/remotes/origin/main', mainTip)
    git(directory, 'switch', '--quiet', '--orphan', 'unreachable')
    const sourceSha = commit(directory, 'source')

    const result = verify(directory, sourceSha)

    expect(result.status).not.toBe(0)
    expect(result.output).toBe('')
  })

  it('rejects shallow history and a missing pinned origin/main ref', () => {
    const source = repository()
    const sourceSha = commit(source, 'source')
    const shallow = mkdtempSync(join(tmpdir(), 'image-main-ancestor-shallow-'))
    onTestFinished(() => rmSync(shallow, { force: true, recursive: true }))
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${source}`, shallow])

    expect(verify(shallow, sourceSha).status).not.toBe(0)

    const withoutRemote = repository()
    const localSha = commit(withoutRemote, 'local')
    expect(verify(withoutRemote, localSha).status).not.toBe(0)
  })

  it('rejects malformed source revisions before writing outputs', () => {
    const directory = repository()
    const sourceSha = commit(directory, 'source')
    git(directory, 'update-ref', 'refs/remotes/origin/main', sourceSha)

    for (const malformed of ['HEAD', sourceSha.toUpperCase(), sourceSha.slice(1)]) {
      const result = verify(directory, malformed)
      expect(result.status).not.toBe(0)
      expect(result.output).toBe('')
    }
  })
})
