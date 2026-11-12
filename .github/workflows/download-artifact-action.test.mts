import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const script = resolve('.github/actions/download-artifact/download-artifact.sh')
const roots: string[] = []

type Fixture = { id: number; name: string; content: string; digest?: string | null }

/** Builds a fake `curl` that serves the artifact list and zip archives from disk. */
function setup(artifacts: Fixture[], hiddenListCalls = 0) {
  const root = mkdtempSync(join(tmpdir(), 'download-artifact-action-'))
  roots.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const served = artifacts.map(artifact => {
    const dir = join(root, `src-${artifact.id}`)
    mkdirSync(dir)
    writeFileSync(join(dir, 'file.txt'), artifact.content)
    const zip = join(root, `${artifact.id}.zip`)
    const made = spawnSync('zip', ['-q', '-j', zip, join(dir, 'file.txt')])
    if (made.status !== 0) throw new Error('zip is required for this test')
    const digest = `sha256:${createHash('sha256').update(readFileSync(zip)).digest('hex')}`
    return {
      id: artifact.id,
      name: artifact.name,
      expired: false,
      digest: artifact.digest === undefined ? digest : artifact.digest,
    }
  })
  writeFileSync(join(root, 'list.json'), JSON.stringify({ artifacts: served }))
  // The first `hiddenListCalls` listings omit the last artifact, like a listing that lags an upload.
  writeFileSync(join(root, 'lagging.json'), JSON.stringify({ artifacts: served.slice(0, -1) }))
  const curl = `#!/usr/bin/env bash
echo "$@" >> "${root}/curl.log"
out=''; url=''
while [ $# -gt 0 ]; do
  case "$1" in -o) out="$2"; shift 2;; http*) url="$1"; shift;; *) shift;; esac
done
case "$url" in
  *"/artifacts?"*)
    n=$(( $(cat "${root}/list.count" 2>/dev/null || echo 0) + 1 )); echo $n > "${root}/list.count"
    if [ $n -le ${hiddenListCalls} ]; then cp "${root}/lagging.json" "$out"; else cp "${root}/list.json" "$out"; fi;;
  *"/zip") id="\${url%/zip}"; cp "${root}/\${id##*/}.zip" "$out";;
esac
`
  writeFileSync(join(bin, 'curl'), curl, { mode: 0o755 })
  return { root, bin }
}

function run(root: string, bin: string, env: Record<string, string>) {
  return spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      GH_TOKEN: 'token',
      ARTIFACT_REPOSITORY: 'owner/repo',
      ARTIFACT_RUN_ID: '1',
      ARTIFACT_PATH: join(root, 'out'),
      ...env,
    },
  })
}

describe('download-artifact composite action', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  it('extracts one named artifact into the path after verifying its digest', () => {
    const { root, bin } = setup([
      { id: 11, name: 'db', content: 'dump' },
      { id: 12, name: 'other', content: 'no' },
    ])
    const result = run(root, bin, { ARTIFACT_NAME: 'db' })

    expect(result.status).toBe(0)
    expect(readFileSync(join(root, 'out/file.txt'), 'utf8')).toBe('dump')
    expect(readFileSync(join(root, 'curl.log'), 'utf8')).toMatch(/--max-time 120/)
  })

  it('puts each pattern match in its own directory unless merging', () => {
    const { root, bin } = setup([
      { id: 21, name: 'hits-1', content: 'a' },
      { id: 22, name: 'hits-2', content: 'b' },
      { id: 23, name: 'skip', content: 'c' },
    ])
    expect(run(root, bin, { ARTIFACT_PATTERN: 'hits-*' }).status).toBe(0)
    expect(readFileSync(join(root, 'out/hits-1/file.txt'), 'utf8')).toBe('a')
    expect(readFileSync(join(root, 'out/hits-2/file.txt'), 'utf8')).toBe('b')
    expect(existsSync(join(root, 'out/skip'))).toBe(false)
  })

  it('merges pattern matches directly into the path', () => {
    const { root, bin } = setup([{ id: 31, name: 'hits-1', content: 'a' }])
    const result = run(root, bin, { ARTIFACT_PATTERN: 'hits-*', ARTIFACT_MERGE_MULTIPLE: 'true' })

    expect(result.status).toBe(0)
    expect(readFileSync(join(root, 'out/file.txt'), 'utf8')).toBe('a')
  })

  it('fails closed on a digest mismatch, a missing digest, or a missing named artifact', () => {
    const mismatch = setup([{ id: 41, name: 'db', content: 'x', digest: 'sha256:00' }])
    const bad = run(mismatch.root, mismatch.bin, { ARTIFACT_NAME: 'db' })
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('does not match')
    expect(existsSync(join(mismatch.root, 'out'))).toBe(false)

    const missing = setup([{ id: 42, name: 'db', content: 'x', digest: null }])
    expect(run(missing.root, missing.bin, { ARTIFACT_NAME: 'db' }).stderr).toContain('no SHA-256')

    const absent = setup([{ id: 43, name: 'db', content: 'x' }])
    expect(run(absent.root, absent.bin, { ARTIFACT_NAME: 'nope' }).stderr).toContain(
      'No artifact named nope',
    )
  })

  it('warns instead of failing when a pattern matches nothing, and rejects both selectors', () => {
    const { root, bin } = setup([{ id: 51, name: 'db', content: 'x' }])
    const none = run(root, bin, { ARTIFACT_PATTERN: 'zzz-*' })
    expect(none.status).toBe(0)
    expect(none.stdout).toContain('::warning::No artifacts matched')

    const both = run(root, bin, { ARTIFACT_NAME: 'db', ARTIFACT_PATTERN: 'db' })
    expect(both.status).toBe(1)
  })

  it('re-reads a lagging listing until every expected artifact appears', () => {
    const { root, bin } = setup(
      [
        { id: 61, name: 'hits-1', content: 'a' },
        { id: 62, name: 'hits-2', content: 'b' },
      ],
      2,
    )
    const result = run(root, bin, {
      ARTIFACT_PATTERN: 'hits-*',
      ARTIFACT_EXPECTED_NAMES: 'hits-1 hits-2',
      ARTIFACT_POLL_INTERVAL_SECONDS: '0',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Waiting for artifacts not yet listed: hits-2')
    expect(readFileSync(join(root, 'out/hits-2/file.txt'), 'utf8')).toBe('b')
    expect(readFileSync(join(root, 'list.count'), 'utf8').trim()).toBe('3')
  })

  it('fails naming the missing artifacts once the deadline passes', () => {
    const { root, bin } = setup([{ id: 71, name: 'hits-1', content: 'a' }])
    const result = run(root, bin, {
      ARTIFACT_PATTERN: 'hits-*',
      ARTIFACT_EXPECTED_NAMES: 'hits-1,hits-2',
      ARTIFACT_WAIT_TIMEOUT_SECONDS: '1',
      ARTIFACT_POLL_INTERVAL_SECONDS: '1',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('missing from run 1 after 1s: hits-2.')
    expect(existsSync(join(root, 'out'))).toBe(false)
  })
})
