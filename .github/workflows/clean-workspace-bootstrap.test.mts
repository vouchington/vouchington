import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowsDirectory = '.github/workflows'
const cleanerAction = './.github/actions/clean-workspace'
const restoreCommand = `rm -rf -- .github/actions/clean-workspace/action.yml ci/curl-to.sh ci/exec-vouchington-gha.sh package.json pnpm-lock.yaml
git archive --format=tar HEAD -- .github/actions/clean-workspace/action.yml ci/curl-to.sh ci/exec-vouchington-gha.sh package.json pnpm-lock.yaml | tar -x
`
const trustedTreeRestoreCommand = `rm -f -- .git/index
git config --worktree --unset-all core.sparseCheckout || true
git config --worktree --unset-all core.sparseCheckoutCone || true
git config --unset-all core.sparseCheckout || true
git config --unset-all core.sparseCheckoutCone || true
git read-tree --empty
git reset --hard HEAD
`

type WorkflowStep = {
  if?: string
  name?: string
  shell?: string
  run?: string
  uses?: string
}

type Workflow = {
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}

describe('clean-workspace bootstrap', () => {
  it('checks out before restoring the local action before every invocation', () => {
    let invocationCount = 0
    const mismatches: string[] = []
    const remoteRepairRefs: string[] = []

    for (const filename of readdirSync(workflowsDirectory)) {
      if (!filename.endsWith('.yml')) continue

      const workflowText = readFileSync(`${workflowsDirectory}/${filename}`, 'utf8')
      const workflow = load(workflowText) as Workflow
      if (workflowText.includes('repair-workspace-permissions')) remoteRepairRefs.push(filename)

      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [stepIndex, step] of (job.steps ?? []).entries()) {
          if (step.uses !== cleanerAction) continue

          invocationCount += 1
          const bootstrap = job.steps?.[stepIndex - 1]
          const checkout = job.steps
            ?.slice(0, stepIndex - 1)
            .findLast(candidate => candidate.uses?.startsWith('actions/checkout@'))
          const checkoutIndex = job.steps?.indexOf(checkout ?? {}) ?? -1
          const expected = {
            name: 'Restore workspace cleaner',
            shell: 'bash',
            run: restoreCommand,
            ...(checkout?.if === undefined ? {} : { if: checkout.if }),
          }
          if (!isDeepStrictEqual(bootstrap, expected))
            mismatches.push(`${filename}:${jobName}:restore`)
          if (checkoutIndex < 0 || checkoutIndex >= stepIndex - 1)
            mismatches.push(`${filename}:${jobName}:checkout`)
        }
      }
    }

    expect(invocationCount).toBeGreaterThan(0)
    expect(remoteRepairRefs).toEqual([])
    expect(mismatches).toEqual([])
  })

  it('restores only cleaner prerequisites and replaces a stale directory conflict', () => {
    const directory = mkdtempSync(join(tmpdir(), 'clean-workspace-bootstrap-'))

    try {
      execFileSync('git', ['init', '--quiet'], { cwd: directory })
      execFileSync('git', ['config', 'user.name', 'CI test'], { cwd: directory })
      execFileSync('git', ['config', 'user.email', 'tests+clean-workspace@voucha.ai'], {
        cwd: directory,
      })
      mkdirSync(join(directory, '.github/actions/clean-workspace'), { recursive: true })
      mkdirSync(join(directory, 'ci'), { recursive: true })
      writeFileSync(join(directory, '.github/actions/clean-workspace/action.yml'), 'name: test\n')
      writeFileSync(join(directory, 'ci/curl-to.sh'), 'curl helper\n')
      writeFileSync(join(directory, 'ci/exec-vouchington-gha.sh'), 'exec helper\n')
      writeFileSync(join(directory, 'package.json'), '{}\n')
      writeFileSync(join(directory, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
      writeFileSync(join(directory, 'unrelated-tracked-file'), 'do not restore\n')
      execFileSync('git', ['add', '.'], { cwd: directory })
      execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: directory })
      unlinkSync(join(directory, '.github/actions/clean-workspace/action.yml'))
      unlinkSync(join(directory, 'ci/exec-vouchington-gha.sh'))
      mkdirSync(join(directory, 'ci/exec-vouchington-gha.sh'))
      writeFileSync(join(directory, 'ci/exec-vouchington-gha.sh/stale'), 'stale\n')
      unlinkSync(join(directory, 'unrelated-tracked-file'))

      execFileSync('bash', ['-c', restoreCommand], {
        cwd: directory,
      })

      expect(
        readFileSync(join(directory, '.github/actions/clean-workspace/action.yml'), 'utf8'),
      ).toBe('name: test\n')
      expect(readFileSync(join(directory, 'ci/exec-vouchington-gha.sh'), 'utf8')).toBe(
        'exec helper\n',
      )
      expect(() => readFileSync(join(directory, 'unrelated-tracked-file'), 'utf8')).toThrow(
        /ENOENT/u,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('keeps change detection out of full-index recovery', () => {
    const workflow = load(
      readFileSync(`${workflowsDirectory}/ci-detect-changes.yml`, 'utf8'),
    ) as Workflow
    const job = workflow.jobs?.['detect-changes']
    const restore = job?.steps?.find(step => step.name === 'Restore workspace cleaner')?.run

    expect(restore).toBe(restoreCommand)
    expect(restore).not.toContain('.git/index')
    expect(restore).not.toContain('git read-tree --empty')
    expect(restore).not.toContain('git reset --hard HEAD')
  })

  it('repairs the initialize smoke checkout before consuming tracked files', () => {
    const workflow = load(
      readFileSync(`${workflowsDirectory}/initialize-smoke-test.yml`, 'utf8'),
    ) as Workflow
    const steps = workflow.jobs?.['initialize-smoke-test']?.steps ?? []
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'))

    expect(checkoutIndex).toBeGreaterThanOrEqual(0)
    expect(steps[checkoutIndex + 1]).toEqual({
      name: 'Restore checked-out tree',
      shell: 'bash',
      run: trustedTreeRestoreCommand,
    })
  })
})
