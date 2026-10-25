import { describe, expect, it } from 'vitest'

import {
  formatViolation,
  gateMatches,
  jobFiles,
  jobReferences,
  pathGateViolations,
  stepFiles,
} from '../test-helpers/ci-job-path-references.mts'

describe('ci path filters cover files that gated jobs execute', () => {
  it('finds the Playwright job and its Node test options wrapper', () => {
    const found = jobReferences().some(
      ref =>
        ref.area === 'web' &&
        ref.job === 'test-playwright' &&
        ref.file === 'ci/with-node-test-options',
    )
    expect(found).toBe(true)
  })

  it('resolves run paths against explicit and inherited working directories', () => {
    const run = 'node data-stores/psql/migrate.mts'
    const expected = ['backend/data-stores/psql/migrate.mts']
    expect([...stepFiles([{ run, 'working-directory': 'backend' }], new Set()).keys()]).toEqual(
      expected,
    )
    expect([...stepFiles([{ run }], new Set(), 'backend').keys()]).toEqual(expected)
    expect([
      ...stepFiles(
        [{ run: 'bash $GITHUB_WORKSPACE/ci/with-node-test-options' }],
        new Set(),
        'backend',
      ).keys(),
    ]).toEqual(['ci/with-node-test-options'])
  })

  it('resolves bare filenames, parent paths and workspace-root paths', () => {
    const message = "message='See docs/development/tests.md#live-provider-smoke-checks.'"
    expect([...stepFiles([{ run: message }], new Set()).keys()]).toEqual([])
    for (const run of ["cat 'docs/development/tests.md'", 'node "ci/vitest/shard-total.mts"']) {
      const file = run.startsWith('cat') ? 'docs/development/tests.md' : 'ci/vitest/shard-total.mts'
      expect([...stepFiles([{ run }], new Set()).keys()]).toEqual([file])
    }
    const directory = 'backend/data-stores/psql'
    const expected = ['backend/data-stores/psql/migrate.mts']
    for (const run of ['node migrate.mts', 'node ./migrate.mts', 'node ../psql/migrate.mts']) {
      expect([...stepFiles([{ run }], new Set(), directory).keys()]).toEqual(expected)
      expect([
        ...stepFiles([{ run, 'working-directory': directory }], new Set(), 'ci').keys(),
      ]).toEqual(expected)
    }
    for (const run of [
      'bash $GITHUB_WORKSPACE/ci/with-node-test-options',
      'bash ${{ github.workspace }}/ci/with-node-test-options',
    ]) {
      expect([...stepFiles([{ run }], new Set(), directory).keys()]).toEqual([
        'ci/with-node-test-options',
      ])
    }
  })

  it('collects executable references supplied only by job-level environment', () => {
    const steps = [{ run: 'node "$SCRIPT"' }]
    expect([
      ...jobFiles({ env: { SCRIPT: 'ci/vitest/shard-total.mts' }, steps }, new Set()).keys(),
    ]).toEqual(['ci/vitest/shard-total.mts'])
    expect([
      ...jobFiles({ env: { SCRIPT: 'data-stores/psql/migrate.mts' }, steps }, new Set(), {
        run: { 'working-directory': 'backend' },
      }).keys(),
    ]).toEqual(['backend/data-stores/psql/migrate.mts'])
    expect([
      ...jobFiles(
        {
          env: { SCRIPT: 'data-stores/psql/migrate.mts' },
          steps: [{ run: 'node "$SCRIPT"', 'working-directory': 'backend' }],
        },
        new Set(),
      ).keys(),
    ]).toEqual(['backend/data-stores/psql/migrate.mts'])
    expect([
      ...jobFiles(
        {
          defaults: { run: { 'working-directory': 'backend' } },
          env: { SCRIPT: 'ci/vitest/shard-total.mts' },
          steps: [{ run: 'node "$SCRIPT"', 'working-directory': '.' }],
        },
        new Set(),
      ).keys(),
    ]).toEqual(['ci/vitest/shard-total.mts'])
    expect([
      ...jobFiles({ steps }, new Set(), undefined, { SCRIPT: 'ci/vitest/shard-total.mts' }).keys(),
    ]).toEqual(['ci/vitest/shard-total.mts'])
    expect([
      ...jobFiles(
        {
          env: { SCRIPT: 'ci/vitest/shard-total.mts' },
          steps: [{ run: 'node "$SCRIPT"', env: { SCRIPT: 'ci/with-node-test-options' } }],
        },
        new Set(),
      ).keys(),
    ]).toEqual(['ci/with-node-test-options'])
  })

  it('excludes the main-only image resolver from pull-request image jobs', () => {
    const imageReferences = jobReferences().filter(
      ref =>
        ref.via.includes('publish-backend-images.yml') ||
        ref.via.includes('publish-web-images.yml'),
    )
    expect(imageReferences.some(ref => ref.file === 'ci/resolve-published-images.sh')).toBe(false)
    expect(imageReferences.some(ref => ref.file === 'ci/prepare-trivy-db.sh')).toBe(true)
  })

  it('runs the functional invariant suite when only its helper changes', () => {
    expect(
      gateMatches(
        { step: 'filter', key: 'tooling' },
        '.github/test-helpers/ci-job-path-references.mts',
      ),
    ).toBe(true)
  })

  it('triggers every gated job from each tracked file its steps reference', () => {
    expect(jobReferences().some(ref => ref.file === '.nvmrc')).toBe(true)
    expect(gateMatches({ step: 'filter', key: 'workflow-action-changes' }, '.nvmrc')).toBe(true)
    expect(pathGateViolations().map(formatViolation)).toEqual([])
  })
})
