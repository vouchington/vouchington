import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it, onTestFinished } from 'vitest'

const exec = promisify(execFile)

describe('static workflow safety scan', () => {
  it('passes an owned workflow tree and rejects a broken shell policy through the CLI', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-safety-fixture-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    await exec('git', ['init', '--quiet', root])
    const workflows = join(root, '.github/workflows')
    await mkdir(workflows, { recursive: true })
    const source = 'on: pull_request_target\njobs: {}\n'
    await writeFile(join(workflows, 'cancel-dequeued-merge-group-runs.yml'), source)
    const ejection = join(workflows, 'merge-queue-ejection.yml')
    await writeFile(ejection, source)
    await exec('git', ['-C', root, 'add', '.github/workflows'])
    await writeFile(join(workflows, 'untracked.yml'), 'on: pull_request_target\njobs: {}\n')
    const command = join(import.meta.dirname, 'check-workflow-safety-policy.mts')
    expect((await exec(process.execPath, [command, root])).stdout).toBe('')
    await writeFile(
      ejection,
      'on: pull_request_target\njobs:\n  update:\n    steps:\n      - run: git push origin update\n',
    )
    await expect(exec(process.execPath, [command, root])).rejects.toMatchObject({
      code: 1,
      stderr:
        'merge-queue-ejection#update step 0: branch update must use -c core.hooksPath=/dev/null\n',
    })
  })

  it('fails closed when the supplied tree has no workflows', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-safety-empty-'))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
    await exec('git', ['init', '--quiet', root])
    await mkdir(join(root, '.github/workflows'), { recursive: true })
    await expect(
      exec(process.execPath, [join(import.meta.dirname, 'check-workflow-safety-policy.mts'), root]),
    ).rejects.toMatchObject({
      code: 1,
      stderr: 'No workflows found for workflow safety policy\n',
    })
  })
})
