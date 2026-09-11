import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { recordFriction, type JournalEntry } from 'vouchington-tooling/session-friction'

import {
  entriesClientFixture,
  entriesIterable,
  entryFixture,
  failingEntriesIterable,
  HOSTED_ENV,
} from '../../blackboard/test-helpers/client-fixtures.mts'
import { validateRetroDoc } from '../../retrospective-validate.mts'
import { readPersistedSessionId } from '../../agent-session-id/persist.mts'
import { frictionLogDirectory } from '../config.mts'
import { buildReport, runReport } from '../report.mts'
import { loadJournalEntries } from '../report/journal.mts'

const testDirs: string[] = []
const CONFORMING_BLOCK = [
  '- `recurring` — `GitHub Actions` — flaky vitest suite timing out',
  '  - Evidence: CI run #1234 failed twice on main with the same timeout',
  '  - Root diagnostic: shared runner oversubscription causing OOM kills',
  '  - Disposition: retried and passed; tracked in issue #9000',
].join('\n')

function makeEnv(): NodeJS.ProcessEnv {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'session-friction-report-')))
  testDirs.push(directory)
  return { ...HOSTED_ENV, TMPDIR: directory }
}

describe('buildReport', () => {
  afterEach(() => {
    testDirs.splice(0).forEach(directory => rmSync(directory, { force: true, recursive: true }))
  })

  it('combines shared friction evidence with hosted journal entries', async () => {
    const env = makeEnv()
    recordFriction(
      'sess-1',
      { type: 'permission-request', command: 'git push' },
      { directory: frictionLogDirectory(env), timestamp: '2026-07-20T00:00:00.000Z' },
    )
    const entries = entriesClientFixture({
      get: () =>
        entriesIterable([
          entryFixture({ data: { type: 'journal', markdown: CONFORMING_BLOCK } }),
          entryFixture({ data: { type: 'retrospective', markdown: 'ignored' } }),
        ]),
    })
    const report = await buildReport('sess-1', env, entries)
    expect(report).toContain('Status: failures observed')
    expect(report).toContain('Evidence: CI run \\#1234 failed twice')
    expect(report).toContain('## Sandbox & Permission Audit')
    expect(report).toContain('git push')
  })

  it('treats a missing journal session as an empty successful read', async () => {
    const env = makeEnv()
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable('agent-blackboard request failed: GET /sessions/s1/entries -> 404'),
    })
    await expect(buildReport('s1', env, entries)).resolves.toContain(
      'Status: unavailable (no friction log for session s1)',
    )
  })

  it('maps an initial 404 to the journal loader not-found result', async () => {
    const entries = entriesClientFixture({
      get: () =>
        failingEntriesIterable('agent-blackboard request failed: GET /sessions/s1/entries -> 404'),
    })
    await expect(loadJournalEntries('s1', makeEnv(), entries)).resolves.toEqual({
      status: 'not-found',
    })
  })

  it('preserves a stream failure after the first entry', async () => {
    const entries = entriesClientFixture({
      get: () => ({
        async *[Symbol.asyncIterator]() {
          yield entryFixture({ data: { type: 'journal', markdown: CONFORMING_BLOCK } })
          throw new TypeError('fetch failed')
        },
      }),
    })
    const loaded = await loadJournalEntries('s1', makeEnv(), entries)
    if (loaded.status !== 'ok') throw new Error('expected journal entries')
    const iterator = (loaded.entries as AsyncIterable<JournalEntry>)[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    await expect(iterator.next()).rejects.toThrow('fetch failed')
  })

  it('keeps a fetch failure out of markdown and writes its diagnostic to stderr', async () => {
    const env = makeEnv()
    const entries = entriesClientFixture({ get: () => failingEntriesIterable('fetch failed') })
    const chunks: string[] = []
    const report = await buildReport('s1', env, entries, {
      write(chunk: string) {
        chunks.push(chunk)
        return true
      },
    })
    expect(report).toContain('Status: unavailable (blackboard unreachable)')
    expect(report).not.toContain('fetch failed')
    expect(chunks.join('')).toContain('fetch failed')
  })

  it('produces retrospective sections accepted by the document validator', async () => {
    const env = makeEnv()
    const report = await buildReport('sess-round-trip', env, entriesClientFixture())
    const document = [
      '## Verifiable Facts',
      '=== Retrospective Facts ===',
      'branch: session-friction',
      '',
      '## Transcript Facts',
      '=== Transcript Facts ===',
      'turns: 3',
      '',
      report,
    ].join('\n')
    expect(validateRetroDoc(document)).toEqual({ ok: true, errors: [] })
  })

  it('rotates a root Codex session once, then reuses it for later reports', async () => {
    const env = makeEnv()
    const cwd = env.TMPDIR
    if (!cwd) throw new Error('expected makeEnv to set TMPDIR')
    const entries = entriesClientFixture()

    await runReport(['--root-codex', '--new-root-codex-session'], env, entries, cwd)
    const sessionId = readPersistedSessionId(cwd, 'codex')
    expect(sessionId).toMatch(/^codex-/)

    await runReport(['--root-codex'], env, entries, cwd)
    expect(readPersistedSessionId(cwd, 'codex')).toBe(sessionId)
  })
})
