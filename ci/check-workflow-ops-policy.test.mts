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

describe('static workflow ops scan', () => {
  it('passes a tracked workflow tree and rejects a broken fix-main subscription', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-ops-policy-fixture-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    await exec('git', ['init', '--quiet', root])

    const workflows = join(root, '.github/workflows')
    await mkdir(workflows, { recursive: true })
    await mkdir(join(root, '.github'), { recursive: true })
    await mkdir(join(root, 'ci'), { recursive: true })
    const files: Record<string, string> = {
      '.github/workflows/main.yml': 'name: Main\non: push\njobs: {}\n',
      '.github/workflows/nightly.yml':
        'name: Nightly\non:\n  schedule: [{ cron: "0 0 * * *" }]\n  workflow_dispatch: {}\njobs: {}\n',
      '.github/workflows/fix-main.yml':
        'name: Fix Main\non:\n  workflow_run:\n    workflows: [Main, Nightly, "Dispatch completed deploy"]\njobs: {}\n',
      '.github/workflows/postgres.yml': `jobs:\n  test:\n    services:\n      postgres:\n        image: ${fixtureImage}\n        env:\n          POSTGRES_INITDB_ARGS: '${postgresArgs}'\n`,
      '.github/workflows/explain-analyze.yml':
        "jobs:\n  test:\n    services:\n      postgres:\n        env:\n          POSTGRES_INITDB_ARGS: '-c max_connections=300 -c log_min_messages=log -c work_mem=32MB'\n",
      '.github/workflows/initialize-smoke-test.yml': `jobs:\n  smoke:\n    steps:\n      - run: docker run -e POSTGRES_INITDB_ARGS="${postgresArgs}"\n`,
      '.github/workflows/ci-detect-changes.yml': `jobs:\n  detect-changes:\n    steps:\n      - name: Resolve merge queue diff range\n        if: github.event_name == 'merge_group'\n        run: |\n          HEAD_SHA="$(git rev-parse HEAD)"\n          git merge-base origin/main "$HEAD_SHA"\n      - name: Check for docs-only changes\n        env:\n          EVENT_NAME: \${{ github.event_name }}\n          MERGE_QUEUE_BASE_SHA: \${{ steps.merge-queue-range.outputs.base }}\n          MERGE_QUEUE_HEAD_SHA: \${{ steps.merge-queue-range.outputs.head }}\n        run: git diff --name-only "$MERGE_QUEUE_BASE_SHA" "$MERGE_QUEUE_HEAD_SHA"\n      - uses: dorny/paths-filter@synthetic\n        with:\n          base: \${{ steps.merge-queue-range.outputs.base }}\n          ref: \${{ steps.merge-queue-range.outputs.head }}\n      - uses: dorny/paths-filter@synthetic\n        with:\n          base: \${{ steps.merge-queue-range.outputs.base }}\n          ref: \${{ steps.merge-queue-range.outputs.head }}\n`,
      '.github/workflows/script-owner.yml':
        'on:\n  pull_request:\n    paths: [ci/check.sh]\n  push:\n    paths: [ci/check.sh]\njobs:\n  test:\n    steps:\n      - run: bash ci/check.sh\n',
      '.github/ci-path-filters.yml': 'tooling: ["ci/**"]\nshell-scripts: ["ci/*.sh"]\n',
      'ci/check.sh': '#!/usr/bin/env bash\ntrue\n',
    }
    for (const [path, source] of Object.entries(files)) {
      const filePath = join(root, path)
      await mkdir(join(filePath, '..'), { recursive: true })
      await writeFile(filePath, source)
    }
    await exec('git', ['-C', root, 'add', '.github', 'ci'])

    expect(checkWorkflowOpsPolicy(root)).toEqual([])
    expect((await exec(process.execPath, [checkerPath, root])).stdout).toBe(
      'Workflow ops policies passed.\n',
    )

    const ciDetectChangesPath = join(workflows, 'ci-detect-changes.yml')
    const validCiDetectChanges = files['.github/workflows/ci-detect-changes.yml']!
    const originalEnv = [
      `          EVENT_NAME: \${{ github.event_name }}`,
      `          MERGE_QUEUE_BASE_SHA: \${{ steps.merge-queue-range.outputs.base }}`,
      `          MERGE_QUEUE_HEAD_SHA: \${{ steps.merge-queue-range.outputs.head }}`,
    ].join('\n')
    const reorderedEnv = [
      `          MERGE_QUEUE_HEAD_SHA: \${{ steps.merge-queue-range.outputs.head }}`,
      `          EVENT_NAME: \${{ github.event_name }}`,
      `          MERGE_QUEUE_BASE_SHA: \${{ steps.merge-queue-range.outputs.base }}`,
    ].join('\n')
    const reorderedCiDetectChanges = validCiDetectChanges.replace(originalEnv, reorderedEnv)
    expect(reorderedCiDetectChanges).not.toBe(validCiDetectChanges)
    await writeFile(ciDetectChangesPath, reorderedCiDetectChanges)
    await exec('git', ['-C', root, 'add', '.github/workflows/ci-detect-changes.yml'])
    expect(checkWorkflowOpsPolicy(root)).toEqual([])

    const assertCiDetectChangesViolation = async (source: string, expected: string) => {
      expect(source).not.toBe(validCiDetectChanges)
      await writeFile(ciDetectChangesPath, source)
      await exec('git', ['-C', root, 'add', '.github/workflows/ci-detect-changes.yml'])
      expect(checkWorkflowOpsPolicy(root)).toEqual([expected])
    }
    await assertCiDetectChangesViolation(
      validCiDetectChanges.replace(
        "github.event_name == 'merge_group'",
        "github.event_name == 'pull_request'",
      ),
      'ci-detect-changes merge queue range must run only for merge_group',
    )
    await assertCiDetectChangesViolation(
      validCiDetectChanges.replace('git rev-parse HEAD', 'git rev-parse origin/main'),
      'ci-detect-changes must resolve the merge queue head from HEAD',
    )
    await assertCiDetectChangesViolation(
      validCiDetectChanges.replace(
        'git merge-base origin/main "$HEAD_SHA"',
        'git merge-base origin/master "$HEAD_SHA"',
      ),
      'ci-detect-changes must resolve the merge queue base from origin/main',
    )
    await assertCiDetectChangesViolation(
      validCiDetectChanges.replace(
        'MERGE_QUEUE_HEAD_SHA: ${{ steps.merge-queue-range.outputs.head }}',
        'MERGE_QUEUE_HEAD_SHA: ${{ github.sha }}',
      ),
      'ci-detect-changes docs check must use the shared merge-queue base and head',
    )
    await assertCiDetectChangesViolation(
      validCiDetectChanges.replace(
        '      - uses: dorny/paths-filter@synthetic\n        with:\n          base: ${{ steps.merge-queue-range.outputs.base }}\n          ref: ${{ steps.merge-queue-range.outputs.head }}\n',
        '',
      ),
      'ci-detect-changes must have exactly two paths-filter steps',
    )
    await assertCiDetectChangesViolation(
      validCiDetectChanges.replace(
        '          ref: ${{ steps.merge-queue-range.outputs.head }}',
        '          ref: ${{ github.sha }}',
      ),
      'ci-detect-changes paths-filter step 0 must share the resolved base/head',
    )
    await writeFile(ciDetectChangesPath, validCiDetectChanges)
    await exec('git', ['-C', root, 'add', '.github/workflows/ci-detect-changes.yml'])

    await writeFile(
      join(workflows, 'fix-main.yml'),
      'name: Fix Main\non:\n  workflow_run:\n    workflows: [Nightly, "Dispatch completed deploy"]\njobs: {}\n',
    )
    await exec('git', ['-C', root, 'add', '.github/workflows/fix-main.yml'])
    expect(checkWorkflowOpsPolicy(root)).toEqual([
      '.github/workflows/fix-main.yml workflow_run subscriptions differ: Dispatch completed deploy, Nightly',
    ])
    await expect(exec(process.execPath, [checkerPath, root])).rejects.toMatchObject({
      code: 1,
      stderr:
        '.github/workflows/fix-main.yml workflow_run subscriptions differ: Dispatch completed deploy, Nightly\n',
    })
  })
})
