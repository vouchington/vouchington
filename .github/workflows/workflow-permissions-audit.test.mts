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

    it('reports missing explicit job-level permissions on a local caller', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: '',
        calleePermissionsBlock: 'permissions:\n  contents: read',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: missing explicit job-level permissions`,
      ])
    })

    it('reports a map mismatch between caller job grants and callee requirements', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: 'permissions:\n  contents: write',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller grants {"contents":"read"}, callee requires {"contents":"write"}`,
      ])
    })

    it('reports write-all mismatches and accepts an exact write-all match', async () => {
      const dir = await writeWorkflows({
        'caller.yml':
          'permissions:\n  contents: read\njobs:\n  call:\n    uses: ./callee.yml\n    permissions: write-all\n',
        'callee.yml':
          'on:\n  workflow_call:\npermissions: read-all\njobs:\n  inner:\n    runs-on: ubuntu-latest\n    permissions: read-all\n',
      })
      const callerPath = join(dir, 'caller.yml')
      const calleePath = join(dir, 'callee.yml')
      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([
        `  ${callerPath} job "call" → ${calleePath}: caller grants write-all, callee requires read-all`,
      ])

      const match = await writeCallPair({
        callerJobBlock: 'permissions: write-all',
        calleePermissionsBlock: 'permissions: write-all',
      })
      expect(
        callerCalleePermissionMismatches(callTopology(match.callerPath, match.calleePath)),
      ).toEqual([])
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

    it('returns no mismatches when caller job grants equal callee requirements', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: 'permissions:\n  contents: read',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([])
    })

    it('accepts a permission-inheriting callee with explicit caller permissions', async () => {
      const { callerPath, calleePath } = await writeCallPair({
        callerJobBlock: 'permissions:\n      contents: read',
        calleePermissionsBlock: '',
      })

      expect(callerCalleePermissionMismatches(callTopology(callerPath, calleePath))).toEqual([])
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
