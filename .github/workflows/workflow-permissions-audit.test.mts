import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  makeCallEdge,
  makeJob,
  makeTopology,
  makeWorkflow,
} from '../../ci/workflow-topology-test-fixtures.mts'
import {
  callerCalleePermissionMismatches,
  missingTopLevelPermissionPaths,
} from './workflow-permissions-audit.mts'

describe('workflow permissions audit', () => {
  const dirs: string[] = []

  async function writeWorkflows(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'workflow-permissions-audit-'))
    dirs.push(dir)
    await Promise.all(Object.entries(files).map(([name, body]) => writeFile(join(dir, name), body)))
    return dir
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  describe('missingTopLevelPermissionPaths', () => {
    it('skips purely reusable workflows and reports missing top-level permissions', async () => {
      const dir = await writeWorkflows({
        'reusable.yml': 'on:\n  workflow_call:\njobs:\n  inner:\n    runs-on: ubuntu-latest\n',
        'missing.yml': 'on: push\njobs:\n  work:\n    runs-on: ubuntu-latest\n',
        'mixed.yml': 'on:\n  workflow_call:\n  push:\njobs:\n  work:\n    runs-on: ubuntu-latest\n',
        'ok.yml':
          'on: push\npermissions:\n  contents: read\njobs:\n  work:\n    runs-on: ubuntu-latest\n',
      })

      expect(
        missingTopLevelPermissionPaths([
          join(dir, 'reusable.yml'),
          join(dir, 'missing.yml'),
          join(dir, 'mixed.yml'),
          join(dir, 'ok.yml'),
        ]),
      ).toEqual([join(dir, 'missing.yml'), join(dir, 'mixed.yml')])
    })
  })

  describe('callerCalleePermissionMismatches', () => {
    async function writeCallPair(args: {
      callerJobBlock: string
      calleePermissionsBlock: string
    }): Promise<{ callerPath: string; calleePath: string }> {
      const dir = await writeWorkflows({
        'caller.yml': `permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    ${args.callerJobBlock}`,
        'callee.yml': `on:\n  workflow_call:\n${args.calleePermissionsBlock}\njobs:\n  inner:\n    runs-on: ubuntu-latest\n`,
      })
      return { callerPath: join(dir, 'caller.yml'), calleePath: join(dir, 'callee.yml') }
    }

    function callTopology(callerPath: string, calleePath: string, callable = true) {
      const callerJob = makeJob({
        id: `${callerPath}#call`,
        workflowId: callerPath,
        key: 'call',
      })
      return makeTopology({
        workflows: [
          makeWorkflow({ id: callerPath, path: callerPath, jobIds: [callerJob.id] }),
          makeWorkflow({ id: calleePath, path: calleePath, callable }),
        ],
        jobs: [callerJob],
        edges: [makeCallEdge(callerJob.id, calleePath)],
      })
    }

    it('requires caller jobs to declare an explicit permission map', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: '',
        calleePermissionsBlock: 'permissions:\n  contents: read',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller permissions must be an explicit map`,
      ])
    })

    it('rejects a caller map that is weaker than explicit callee requirements', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: 'permissions:\n  contents: write',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller grants {"contents":"read"}, callee requires {"contents":"write"}`,
      ])
    })

    it('rejects write-all on either side of a reusable workflow call', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions: write-all\n',
        'callee.yml':
          'on:\n  workflow_call:\npermissions: read-all\njobs:\n  inner:\n    runs-on: ubuntu-latest\n    permissions: read-all\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')
      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller grants write-all`,
      ])

      const calleeWriteAll = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: 'permissions: write-all',
      })
      expect(
        callerCalleePermissionMismatches(
          callTopology(calleeWriteAll.callerPath, calleeWriteAll.calleePath),
        ),
      ).toEqual([
        `  ${calleeWriteAll.callerPath} job "call" → ${calleeWriteAll.calleePath}: callee requires write-all`,
      ])
    })

    it('expands callee read-all when comparing against a caller permission map', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: 'permissions: read-all',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        expect.stringContaining(
          `${callerPath} job "call" → ${calleePath}: caller grants {"contents":"read"}, callee requires {`,
        ),
      ])
    })

    it('requires exact scope equality when every callee job has its own permissions', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: 'permissions:\n  contents: read',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([])
    })

    it('allows caller scopes beyond explicit callee scopes only for a real inheriting callee job', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: read\n      issues: read\n',
        'callee.yml':
          'on:\n  workflow_call:\njobs:\n  explicit:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n  inherits:\n    runs-on: ubuntu-latest\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([])
    })

    it('includes skipped callee jobs when checking explicit requirements', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: read\n',
        'callee.yml':
          'on:\n  workflow_call:\npermissions: {}\njobs:\n  skipped:\n    if: false\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller grants {"contents":"read"}, callee requires {"contents":"write"}`,
      ])
    })

    it('does not mistake null permissions for inheritance', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: read\n      issues: read\n',
        'callee.yml':
          'on:\n  workflow_call:\npermissions: null\njobs:\n  inner:\n    runs-on: ubuntu-latest\n    permissions: null\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: callee top-level permissions are invalid`,
      ])
    })

    it('rejects invalid caller maps and invalid callee declarations even beside a real inheriting job', async () => {
      const dir = await writeWorkflows({
        'invalid-caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: banana\n',
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: read\n      issues: read\n',
        'callee.yml':
          'on:\n  workflow_call:\njobs:\n  explicit:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n  inherits:\n    runs-on: ubuntu-latest\n  null-value:\n    runs-on: ubuntu-latest\n    permissions: null\n  scalar-value:\n    runs-on: ubuntu-latest\n    permissions: read\n  unknown-level:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: banana\n',
      })
      const calleePath = join(dir, 'callee.yml')
      const invalidCallerPath = join(dir, 'invalid-caller.yml')
      const callerPath = join(dir, 'caller.yml')

      expect(callerCalleePermissionMismatches(callTopology(invalidCallerPath, calleePath))).toEqual(
        [
          `  ${invalidCallerPath} job "call" → ${calleePath}: caller permissions must be an explicit map`,
        ],
      )
      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: callee job "null-value" permissions are invalid`,
        `  ${callerPath} job "call" → ${calleePath}: callee job "scalar-value" permissions are invalid`,
        `  ${callerPath} job "call" → ${calleePath}: callee job "unknown-level" permissions are invalid`,
      ])
    })

    it('accepts valid empty and none permission maps', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: none\n',
        'callee.yml':
          'on:\n  workflow_call:\npermissions: {}\njobs:\n  inner:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: none\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([])
    })

    it('does not treat a top-level permissions property as inherited when all jobs are explicit', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions:\n      contents: read\n      issues: read\n',
        'callee.yml':
          'on:\n  workflow_call:\npermissions:\n  contents: read\njobs:\n  inner:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller grants {"contents":"read","issues":"read"}, callee requires {"contents":"read"}`,
      ])
    })

    it('skips non-callable callees and non-local call edges', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: '',
        calleePermissionsBlock: 'permissions:\n  contents: write',
      })
      const callerJob = makeJob({
        id: `${callerPath}#call`,
        workflowId: callerPath,
        key: 'call',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath, false))).toEqual(
        [],
      )
      expect(
        callerCalleePermissionMismatches(
          makeTopology({
            workflows: [
              makeWorkflow({ id: callerPath, path: callerPath, jobIds: [callerJob.id] }),
              makeWorkflow({ id: calleePath, path: calleePath, callable: true }),
            ],
            jobs: [callerJob],
            edges: [makeCallEdge(callerJob.id, calleePath, { local: false, to: undefined })],
          }),
        ),
      ).toEqual([])
    })
  })
})
