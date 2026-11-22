import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it, onTestFinished } from 'vitest'
import { checkWorkflowOpsPolicy } from './check-workflow-ops-policy.mts'

const exec = promisify(execFile)
const checkerPath = join(import.meta.dirname, 'check-workflow-ops-policy.mts')
const fixtureImage = `ghcr.io/vouchington/dependency-pgvector:synthetic-tag@sha256:${'b'.repeat(64)}`
const postgresArgs = '-c max_connections=300 -c log_min_messages=log'

const baseFiles: Record<string, string> = {
  '.github/workflows/main.yml': 'name: Main\non: push\njobs: {}\n',
  '.github/workflows/nightly.yml':
    'name: Nightly\non:\n  schedule: [{ cron: "0 0 * * *" }]\n  workflow_dispatch: {}\njobs: {}\n',
  '.github/workflows/postgres.yml': `jobs:\n  test:\n    services:\n      postgres:\n        image: ${fixtureImage}\n        env:\n          POSTGRES_INITDB_ARGS: '${postgresArgs}'\n`,
  '.github/workflows/explain-analyze.yml':
    "jobs:\n  test:\n    services:\n      postgres:\n        env:\n          POSTGRES_INITDB_ARGS: '-c max_connections=300 -c log_min_messages=log -c work_mem=32MB'\n",
  '.github/workflows/initialize-smoke-test.yml':
    'jobs:\n  smoke:\n    steps:\n      - run: source .github/workflows/initialize-smoke-test/prepare-postgres.sh\n',
  '.github/workflows/initialize-smoke-test/prepare-postgres.sh': `docker run -e POSTGRES_INITDB_ARGS="${postgresArgs}" ${fixtureImage}\n`,
  '.github/workflows/ci-detect-changes.yml': `jobs:\n  detect-changes:\n    steps:\n      - name: Resolve merge queue diff range\n        if: github.event_name == 'merge_group'\n        run: |\n          HEAD_SHA="$(git rev-parse HEAD)"\n          git merge-base origin/main "$HEAD_SHA"\n      - name: Check for docs-only changes\n        env:\n          EVENT_NAME: \${{ github.event_name }}\n          MERGE_QUEUE_BASE_SHA: \${{ steps.merge-queue-range.outputs.base }}\n          MERGE_QUEUE_HEAD_SHA: \${{ steps.merge-queue-range.outputs.head }}\n        run: git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"\n      - uses: dorny/paths-filter@synthetic\n        with:\n          base: \${{ steps.merge-queue-range.outputs.base }}\n          ref: \${{ steps.merge-queue-range.outputs.head }}\n      - uses: dorny/paths-filter@synthetic\n        with:\n          base: \${{ steps.merge-queue-range.outputs.base }}\n          ref: \${{ steps.merge-queue-range.outputs.head }}\n`,
  '.github/workflows/script-owner.yml':
    'on:\n  pull_request:\n    paths: [ci/check.sh]\n  push:\n    paths: [ci/check.sh]\njobs:\n  test:\n    steps:\n      - run: bash ci/check.sh\n',
  '.github/ci-path-filters.yml': 'tooling: ["ci/**"]\nshell-scripts: ["ci/*.sh"]\n',
  'ci/check.sh': '#!/usr/bin/env bash\ntrue\n',
}

const ciDetectPath = '.github/workflows/ci-detect-changes.yml'
const smokeScriptPath = '.github/workflows/initialize-smoke-test/prepare-postgres.sh'
const smokeWorkflowPath = '.github/workflows/initialize-smoke-test.yml'
const validCiDetectChanges = baseFiles[ciDetectPath]!
const validSmokeScript = baseFiles[smokeScriptPath]!
const validSmokeWorkflow = baseFiles[smokeWorkflowPath]!
const rangeScript = 'HEAD_SHA="$(git rev-parse HEAD)"\ngit merge-base origin/main "$HEAD_SHA"\n'
const docsScript = 'git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"\n'
const rangeScriptPath = '.github/workflows/ci-detect-changes/merge-queue-range.sh'
const docsScriptPath = '.github/workflows/ci-detect-changes/docs-check.sh'
const extractedCiDetectChanges = validCiDetectChanges
  .replace(
    'run: |\n          HEAD_SHA="$(git rev-parse HEAD)"\n          git merge-base origin/main "$HEAD_SHA"',
    'run: source .github/workflows/ci-detect-changes/merge-queue-range.sh',
  )
  .replace(
    'run: git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"',
    'run: source .github/workflows/ci-detect-changes/docs-check.sh',
  )
const extractedFiles = {
  [ciDetectPath]: extractedCiDetectChanges,
  [rangeScriptPath]: rangeScript,
  [docsScriptPath]: docsScript,
}

/** Create a tracked fixture tree: the base workflows with `overrides` applied, staged by one add. */
async function createTrackedRoot(overrides: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'workflow-ops-policy-fixture-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await exec('git', ['init', '--quiet', root])
  for (const [path, source] of Object.entries({ ...baseFiles, ...overrides })) {
    const filePath = join(root, path)
    await mkdir(join(filePath, '..'), { recursive: true })
    await writeFile(filePath, source)
  }
  await exec('git', ['-C', root, 'add', '.github', 'ci'])
  return root
}

async function rewrite(root: string, path: string, source: string) {
  await writeFile(join(root, path), source)
  await exec('git', ['-C', root, 'add', path])
}

const cliPassed = 'Workflow ops policies passed.\n'

describe('static workflow ops scan', () => {
  it('passes a tracked workflow tree through the library and the CLI', async () => {
    const root = await createTrackedRoot()

    expect(checkWorkflowOpsPolicy(root)).toEqual([])
    expect((await exec(process.execPath, [checkerPath, root])).stdout).toBe(cliPassed)
  })

  it('accepts reordered merge queue env entries', async () => {
    const eventName = '          EVENT_NAME: ${{ github.event_name }}'
    const baseSha = '          MERGE_QUEUE_BASE_SHA: ${{ steps.merge-queue-range.outputs.base }}'
    const headSha = '          MERGE_QUEUE_HEAD_SHA: ${{ steps.merge-queue-range.outputs.head }}'
    const reordered = validCiDetectChanges.replace(
      [eventName, baseSha, headSha].join('\n'),
      [headSha, eventName, baseSha].join('\n'),
    )
    expect(reordered).not.toBe(validCiDetectChanges)

    expect(checkWorkflowOpsPolicy(await createTrackedRoot({ [ciDetectPath]: reordered }))).toEqual(
      [],
    )
  })

  it.each([
    [
      'a merge queue range step that is not merge_group only',
      validCiDetectChanges.replace(
        "github.event_name == 'merge_group'",
        "github.event_name == 'pull_request'",
      ),
      'ci-detect-changes merge queue range must run only for merge_group',
    ],
    [
      'a merge queue head not resolved from HEAD',
      validCiDetectChanges.replace('git rev-parse HEAD', 'git rev-parse origin/main'),
      'ci-detect-changes must resolve the merge queue head from HEAD',
    ],
    [
      'a merge queue base not resolved from origin/main',
      validCiDetectChanges.replace(
        'git merge-base origin/main "$HEAD_SHA"',
        'git merge-base origin/master "$HEAD_SHA"',
      ),
      'ci-detect-changes must resolve the merge queue base from origin/main',
    ],
    [
      'a docs check that does not use the shared head',
      validCiDetectChanges.replace(
        'MERGE_QUEUE_HEAD_SHA: ${{ steps.merge-queue-range.outputs.head }}',
        'MERGE_QUEUE_HEAD_SHA: ${{ github.sha }}',
      ),
      'ci-detect-changes docs check must use the shared merge-queue base and head',
    ],
    [
      'a missing paths-filter step',
      validCiDetectChanges.replace(
        '      - uses: dorny/paths-filter@synthetic\n        with:\n          base: ${{ steps.merge-queue-range.outputs.base }}\n          ref: ${{ steps.merge-queue-range.outputs.head }}\n',
        '',
      ),
      'ci-detect-changes must have exactly two paths-filter steps',
    ],
    [
      'a paths-filter step that does not share the resolved head',
      validCiDetectChanges.replace(
        '          ref: ${{ steps.merge-queue-range.outputs.head }}',
        '          ref: ${{ github.sha }}',
      ),
      'ci-detect-changes paths-filter step 0 must share the resolved base/head',
    ],
  ])('rejects %s', async (_name, source, expected) => {
    expect(source).not.toBe(validCiDetectChanges)

    expect(checkWorkflowOpsPolicy(await createTrackedRoot({ [ciDetectPath]: source }))).toEqual([
      expected,
    ])
  })

  it('rejects a smoke postgres script that drifts from the shared settings', async () => {
    const root = await createTrackedRoot()
    await rewrite(
      root,
      smokeScriptPath,
      validSmokeScript.replace('log_min_messages=log', 'log_min_messages=info'),
    )

    expect(checkWorkflowOpsPolicy(root)).toEqual([
      `${smokeScriptPath} must use the shared Docker postgres settings`,
    ])
  })

  it('rejects a smoke workflow that runs a different preparation script', async () => {
    const root = await createTrackedRoot()
    await rewrite(
      root,
      smokeWorkflowPath,
      validSmokeWorkflow.replace(
        smokeScriptPath,
        '.github/workflows/initialize-smoke-test/wrong-script.sh',
      ),
    )

    expect(checkWorkflowOpsPolicy(root)).toEqual([
      `${smokeWorkflowPath} must run the shared Docker postgres preparation script`,
    ])
  })

  it('rejects an untracked smoke postgres script', async () => {
    const root = await createTrackedRoot()
    await exec('git', ['-C', root, 'rm', '--cached', '--quiet', smokeScriptPath])

    expect(checkWorkflowOpsPolicy(root)).toEqual([
      `${smokeScriptPath} must use the shared Docker postgres settings`,
    ])
  })

  it('passes extracted revision scripts through the library and the CLI', async () => {
    const root = await createTrackedRoot(extractedFiles)

    expect(checkWorkflowOpsPolicy(root)).toEqual([])
    expect((await exec(process.execPath, [checkerPath, root])).stdout).toBe(cliPassed)
  })

  it('rejects an extracted range script that resolves the head from origin/main', async () => {
    const root = await createTrackedRoot({
      ...extractedFiles,
      [rangeScriptPath]: rangeScript.replace('git rev-parse HEAD', 'git rev-parse origin/main'),
    })
    const violation = 'ci-detect-changes must resolve the merge queue head from HEAD'

    expect(checkWorkflowOpsPolicy(root)).toEqual([violation])
    await expect(exec(process.execPath, [checkerPath, root])).rejects.toMatchObject({
      code: 1,
      stderr: `${violation}\n`,
    })
  })

  it('rejects an extracted docs script that ignores the resolved base/head pair', async () => {
    const root = await createTrackedRoot({
      ...extractedFiles,
      [docsScriptPath]: 'git diff --name-only HEAD^1 HEAD\n',
    })

    expect(checkWorkflowOpsPolicy(root)).toEqual([
      'ci-detect-changes docs check must use the resolved base/head pair',
    ])
  })

  it('throws when an extracted revision script is untracked', async () => {
    const root = await createTrackedRoot(extractedFiles)
    await exec('git', ['-C', root, 'rm', '--cached', '--quiet', rangeScriptPath])

    expect(() => checkWorkflowOpsPolicy(root)).toThrow(
      `Missing workflow revision script: ${rangeScriptPath}`,
    )
  })
})
