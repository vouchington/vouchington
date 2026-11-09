import { describe, expect, it } from 'vitest'

import { cachePathsAreAllowed } from './workflow-cache-pnpm-parsing.mts'
import { workflowCachePnpmViolations } from './workflow-cache-pnpm-policy.mts'

import {
  action,
  base,
  changed,
  setup,
  workflow,
} from './test-helpers/workflow-cache-pnpm-fixtures.mts'

describe('workflow cache and pnpm policies', () => {
  it('accepts a complete finite workflow fixture', () => {
    expect(workflowCachePnpmViolations(base)).toEqual([])
  })

  it('requires a setup-node call site in a workflow', () => {
    const expected = 'Expected at least one actions/setup-node workflow call site'
    expect(workflowCachePnpmViolations(base)).not.toContain(expected)

    const source = base
      .get(`${workflow}test.yml`)!
      .replace(`- uses: actions/setup-node@${'a'.repeat(40)} # v6`, '- name: No setup-node')
    const withoutWorkflowSetup = changed(`${workflow}test.yml`, source)
    withoutWorkflowSetup.set(
      `${action}build-web-targets/action.yml`,
      `${base.get(`${action}build-web-targets/action.yml`)}    - uses: actions/setup-node@${'a'.repeat(40)} # v6\n`,
    )
    expect(workflowCachePnpmViolations(withoutWorkflowSetup)).toContain(expected)
  })

  it.each([
    ['Playwright browsers', '~/.cache/ms-playwright', true],
    [
      'shared web paths in unrelated action',
      ['web/.next/standalone', 'web/.next/static', 'cloudflare-worker/dist'],
      false,
    ],
    ['node_modules', 'node_modules', false],
    ['npm store', '~/.npm', false],
    ['yarn store', '~/.cache/yarn', false],
    ['arbitrary cache', '.cache/vite/vitest', false],
    ['mixed paths', ['~/.cache/ms-playwright', 'node_modules'], false],
    ['missing path', undefined, false],
  ])('%s allowed: %s', (_name, value, allowed) => {
    expect(cachePathsAreAllowed(value)).toBe(allowed)
  })

  it('allows the exact web runtime paths only in build-web-targets', () => {
    const paths = ['web/.next/standalone', 'web/.next/static', 'cloudflare-worker/dist']
    expect(cachePathsAreAllowed(paths, `${action}build-web-targets/action.yml`)).toBe(true)
    expect(
      cachePathsAreAllowed([...paths, 'web/.next/cache'], `${action}build-web-targets/action.yml`),
    ).toBe(false)
  })

  it('allows only the lingua-rs binary path in setup-backend', () => {
    const path =
      'node_modules/.pnpm/lingua-rs@${{ steps.lingua-rs.outputs.version }}/node_modules/lingua-rs/lingua_rs.*.node'
    const setupBackend = `${action}setup-backend/action.yml`
    expect(cachePathsAreAllowed(path, setupBackend)).toBe(true)
    expect(cachePathsAreAllowed([path, 'node_modules'], setupBackend)).toBe(false)
    expect(cachePathsAreAllowed(path, `${action}other/action.yml`)).toBe(false)
  })

  it('rejects an unapproved flow-style cache step', () => {
    const source =
      'jobs: { test: { steps: [{ uses: actions/cache@sha, with: { path: node_modules } }] } }'
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(
      '.github/workflows/test.yml: actions/cache step 1 has unapproved path "node_modules".',
    )
  })

  it('checks Playwright cache ordering through nested local composites', () => {
    const job = `${base.get(`${workflow}test.yml`)}\n  nested:\n    steps:\n      - uses: ./.github/actions/outer\n`
    const outer = 'runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/inner\n'
    const inner = `runs:
  using: composite
  steps:
    - id: hash
      run: echo "lockfile-hash=$(sha256sum pnpm-lock.yaml)"
    - uses: actions/cache@sha
      with:
        path: ~/.cache/ms-playwright
        key: \${{ runner.os }}-\${{ runner.arch }}-\${{ steps.hash.outputs.lockfile-hash }}
    - name: Nested install
      run: pnpm exec playwright install chromium
`
    const passing = new Map([
      ...changed(`${workflow}test.yml`, job),
      [`${action}outer/action.yml`, outer],
      [`${action}inner/action.yml`, inner],
    ])
    expect(workflowCachePnpmViolations(passing)).toEqual([])
    const broken = new Map(passing)
    broken.set(
      `${action}inner/action.yml`,
      inner.replace('path: ~/.cache/ms-playwright', 'path: node_modules'),
    )
    expect(workflowCachePnpmViolations(broken)).toContain(
      'test.yml#nested: step "Nested install" installs Playwright browsers without a preceding actions/cache step for ~/.cache/ms-playwright.',
    )
  })

  it.each([
    [
      'package cache',
      'package-manager-cache: false',
      'cache: pnpm',
      '.github/workflows/test.yml: package manager cache is prohibited',
    ],
    [
      'Playwright cache key',
      'steps.hash.outputs.lockfile-hash',
      'steps.hash.outputs.bad',
      '.github/workflows/test.yml: "- uses: actions/cache@sha" must key on steps.*.outputs.lockfile-hash.',
    ],
    [
      'Playwright install',
      'path: ~/.cache/ms-playwright',
      'path: node_modules',
      'test.yml#browser: step "Install browsers" installs Playwright browsers without a preceding actions/cache step for ~/.cache/ms-playwright.',
    ],
    [
      'Docker metadata',
      'BUILDX_METADATA_PROVENANCE: disabled',
      'BUILDX_METADATA_PROVENANCE: enabled',
      '.github/workflows/test.yml#browser: Docker build metadata provenance must be disabled',
    ],
    [
      'setup-node version',
      `actions/setup-node@${'a'.repeat(40)} # v6`,
      `actions/setup-node@${'b'.repeat(40)} # v5`,
      '.github/workflows/test.yml: setup-node must be v6 or higher',
    ],
    [
      'setup-node package cache',
      'package-manager-cache: false',
      'package-manager-cache: true',
      '.github/workflows/test.yml: setup-node must disable package manager cache',
    ],
  ])('rejects broken %s policy', (_name, original, replacement, expected) => {
    const source = base.get(`${workflow}test.yml`)!.replace(original, replacement)
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(expected)
  })

  it('rejects a direct pnpm install in an unapproved workflow', () => {
    const source = `${base.get(`${workflow}test.yml`)}\n      - run: pnpm install\n`
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(
      'pnpm install must be owned by setup-node-pnpm; direct sites: .github/workflows/postgresql-snapshot-update.yml#generate, .github/workflows/test.yml#browser',
    )
  })

  it('rejects a setup call after credentials', () => {
    const source = `jobs:\n  browser:\n    steps:\n      - uses: aws-actions/configure-aws-credentials@sha\n      - uses: ${setup}\n`
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(
      '.github/workflows/test.yml#browser: setup after credentials',
    )
  })

  it('rejects an invalid install-scripts opt-out', () => {
    const source = base
      .get(`${workflow}fix-main-self-retry.yml`)!
      .replace("install-scripts: 'false'", "install-scripts: 'no'")
    expect(
      workflowCachePnpmViolations(changed(`${workflow}fix-main-self-retry.yml`, source)),
    ).toContain('.github/workflows/fix-main-self-retry.yml#retry: install-scripts must be false')
  })

  it.each([
    [
      'lockfile hash computation',
      'sha256sum pnpm-lock.yaml',
      'sha256sum package.json',
      '.github/workflows/test.yml: "- uses: actions/cache@sha" keys on lockfile-hash but no step computes it.',
    ],
    [
      'OS and architecture cache scope',
      'runner.arch',
      'github.ref',
      '.github/workflows/test.yml: "- uses: actions/cache@sha" must scope its key by runner.os/runner.arch.',
    ],
    [
      'restore keys',
      'path: ~/.cache/ms-playwright',
      'path: ~/.cache/ms-playwright\n          restore-keys: stale-',
      '.github/workflows/test.yml: Playwright cache "- uses: actions/cache@sha" must not declare restore-keys.',
    ],
    [
      'Node version file',
      "node-version-file: '.nvmrc'",
      "node-version-file: 'other'",
      '.github/workflows/test.yml: setup-node must read .nvmrc',
    ],
    [
      'hardcoded Node version',
      "node-version-file: '.nvmrc'",
      "node-version-file: '.nvmrc'\n          node-version: synthetic-node-version",
      '.github/workflows/test.yml: hardcoded Node version',
    ],
    [
      'setup-node cache input',
      'package-manager-cache: false',
      'package-manager-cache: false\n          cache: npm',
      '.github/workflows/test.yml: setup-node cache input is prohibited',
    ],
    [
      'unexpected setup input',
      `- uses: ${setup}`,
      `- uses: ${setup}\n        with:\n          cache: pnpm`,
      '.github/workflows/test.yml#browser: unexpected setup input cache',
    ],
    [
      'unbounded deadline',
      `- uses: ${setup}`,
      `- uses: ${setup}\n        with:\n          deadline-seconds: 120`,
      '.github/workflows/test.yml#browser: deadline is not below the step cap',
    ],
    [
      'short cap without deadline',
      `- uses: ${setup}`,
      `- uses: ${setup}\n        timeout-minutes: 5`,
      '.github/workflows/test.yml#browser: deadline is not below the step cap',
    ],
  ])('rejects broken %s policy', (_name, original, replacement, expected) => {
    const source = base.get(`${workflow}test.yml`)!.replace(original, replacement)
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(expected)
  })

  it('rejects job-level credentials on dependency setup', () => {
    const source = base
      .get(`${workflow}test.yml`)!
      .replace(
        '  browser:\n    steps:',
        '  browser:\n    env:\n      TOKEN: ${{ secrets.TOKEN }}\n    steps:',
      )
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(
      '.github/workflows/test.yml#browser: job-level secret environment',
    )
  })

  it('rejects changed script-free install callers', () => {
    const source = base
      .get(`${workflow}fix-main-self-retry.yml`)!
      .replace("install-scripts: 'false'", "install-scripts: 'true'")
    expect(
      workflowCachePnpmViolations(changed(`${workflow}fix-main-self-retry.yml`, source)),
    ).toContain(
      'Script-free install callers differ: .github/workflows/fix-main.yml#classify-self-failure, .github/workflows/fix-main.yml#related-candidates, .github/workflows/fix-main.yml#render-prompt, .github/workflows/fix-main.yml#triage-and-rerun, .github/workflows/plan-completion.yml#audit',
    )
  })

  it('rejects Docker build record uploads', () => {
    const path = `${action}build-web-images/action.yml`
    const source = base
      .get(path)!
      .replace("DOCKER_BUILD_RECORD_UPLOAD: 'false'", "DOCKER_BUILD_RECORD_UPLOAD: 'true'")
    expect(workflowCachePnpmViolations(changed(path, source))).toContain(
      'build-web-images must disable Docker build record and summary',
    )
  })

  it('rejects a missing EXPLAIN result upload', () => {
    const path = `${workflow}explain-analyze.yml`
    const source = base.get(path)!.replace('if: always()', 'if: success()')
    expect(workflowCachePnpmViolations(changed(path, source))).toContain(
      'explain-analyze must upload results always',
    )
  })

  it.each([
    'node-version-file: /trusted/.nvmrc',
    'node-version-file: ${{ github.action_path }}/../../../.nvmrc',
    "node-version-file: '${{ github.action_path }}/../../../.nvmrc'",
    'node-version-file: "${{ github.action_path }}/../../../.nvmrc"',
  ])('rejects unsafe version-file input: %s', value => {
    const source = base.get(`${workflow}test.yml`)!.replace("node-version-file: '.nvmrc'", value)
    expect(workflowCachePnpmViolations(changed(`${workflow}test.yml`, source))).toContain(
      '.github/workflows/test.yml: unsafe node-version-file',
    )
  })
})
