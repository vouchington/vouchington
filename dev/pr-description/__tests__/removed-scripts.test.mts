import { describe, expect, it } from 'vitest'

import { findRemovedScripts, type PackageJsonReader } from '../removed-scripts.mts'
import { runAdvisorySupersessionSearch } from '../supersession.mts'

const PATH = 'backend/package.json'

function readerFor(base: string | undefined, head: string | undefined): PackageJsonReader {
  return (_path, side) => Promise.resolve(side === 'base' ? base : head)
}

// Real scripts from this repo's own backend/package.json (12 entries). `db:snapshot:check` is the
// 10th — removing it produces a 3-line-context hunk that never contains the `"scripts": {` opener,
// which is exactly why the old hunk-parsing heuristic (#8779) missed it. Full pre/post-image key
// diffing never consults hunk boundaries, so it isn't susceptible to that failure mode.
const BASE_SCRIPTS = {
  postinstall: 'pnpm --dir ../email-templates run build',
  'test:smoke': './scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh',
  'test:smoke:docker': './scripts/tests/smoke-test-docker.sh',
  typecheck: 'pnpm run typecheck:src && pnpm run typecheck:email-templates',
  'typecheck:src': 'tsc --noEmit --incremental',
  'typecheck:email-templates':
    'tsc --noEmit --incremental --project ../email-templates/tsconfig.json',
  'db:migrate': 'node data-stores/psql/migrate.mts',
  'db:clean': 'bash ../dev/db-clean --db-only',
  'db:snapshot:update': 'node data-stores/psql/schema-snapshot/generate.mts',
  'db:snapshot:check': 'node data-stores/psql/schema-snapshot/generate.mts --check',
  'seed:playwright': 'node scripts/seeds/playwright-test-data.mts',
  'db:seed': 'node scripts/seeds/dev-seed.mts',
}
const BASE_PACKAGE_JSON = JSON.stringify({ name: 'backend', scripts: BASE_SCRIPTS })
const { 'db:snapshot:check': _removed, ...HEAD_SCRIPTS } = BASE_SCRIPTS
const HEAD_PACKAGE_JSON = JSON.stringify({ name: 'backend', scripts: HEAD_SCRIPTS })

describe('findRemovedScripts', () => {
  it('detects a script removed from the 10th of 12 entries — the #8779 regression fixture', async () => {
    const reader = readerFor(BASE_PACKAGE_JSON, HEAD_PACKAGE_JSON)
    await expect(findRemovedScripts([PATH], reader)).resolves.toEqual([
      { name: 'db:snapshot:check', path: PATH, type: 'removed-script' },
    ])
  })

  it('still counts a script as removed when a same-named key survives under dependencies', async () => {
    const base = JSON.stringify({ scripts: { foo: 'echo base' } })
    const head = JSON.stringify({ dependencies: { foo: '^1.0.0' } })
    const reader = readerFor(base, head)
    await expect(findRemovedScripts([PATH], reader)).resolves.toEqual([
      { name: 'foo', path: PATH, type: 'removed-script' },
    ])
  })

  it('does not treat a modified script value as removed', async () => {
    const base = JSON.stringify({ scripts: { test: 'vitest run' } })
    const head = JSON.stringify({ scripts: { test: 'vitest run --coverage' } })
    const reader = readerFor(base, head)
    await expect(findRemovedScripts([PATH], reader)).resolves.toEqual([])
  })

  it('degrades to no removals when a side is missing (new/deleted file, fetch failure)', async () => {
    const reader = readerFor(undefined, JSON.stringify({ scripts: { build: 'tsc' } }))
    await expect(findRemovedScripts([PATH], reader)).resolves.toEqual([])
  })

  it('degrades to no removals when a side is unparseable JSON', async () => {
    const reader = readerFor('not json', JSON.stringify({ scripts: {} }))
    await expect(findRemovedScripts([PATH], reader)).resolves.toEqual([])
  })

  it('reads nothing for an empty path list', async () => {
    let calls = 0
    const reader: PackageJsonReader = (_path, _side) => {
      calls += 1
      return Promise.resolve(undefined)
    }
    await expect(findRemovedScripts([], reader)).resolves.toEqual([])
    expect(calls).toBe(0)
  })
})

// End-to-end proof that the removed script survives buildRemovalVocabulary's stoplist/dedup all the
// way into a real `--search` argv — every supersession.test.mts fixture uses a no-op reader, so this
// composition seam had no coverage of its own until now.
describe('composition: removed script reaches a supersession search term (#8779)', () => {
  it('surfaces db:snapshot:check as a gh issue list --search term', async () => {
    const patch =
      'diff --git a/backend/package.json b/backend/package.json\n' +
      '--- a/backend/package.json\n+++ b/backend/package.json\n@@ -1 +1 @@\n-x\n+y\n'
    const reader = readerFor(BASE_PACKAGE_JSON, HEAD_PACKAGE_JSON)
    const terms: string[] = []
    const runGh = (args: string[]) => {
      terms.push(...args.filter((_, i) => args[i - 1] === '--search'))
      return Promise.resolve('[]')
    }
    await runAdvisorySupersessionSearch(runGh, 'vouchington/vouchington', patch, reader)
    expect(terms).toContain('"db:snapshot:check"')
  })
})
