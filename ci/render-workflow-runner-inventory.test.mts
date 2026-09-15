import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import type { WorkflowTopology } from 'no-mistakes'

import {
  renderJobsInventoryDoc,
  writeJobsInventoryDoc,
} from './render-workflow-runner-inventory.mts'
import { PROJECT_TO_JOB } from './vitest/ci-select.mts'
import {
  CI_WORKFLOW_PATH,
  routeCiTopologyImpact,
  TOPOLOGY_ROOT_JOB_IDS,
} from './workflow-topology-impact.mts'
import { makeCallEdge, makeJob, makeTopology } from './workflow-topology-test-fixtures.mts'

const FIXTURE = [
  '# Workflow Job & Runner Inventory',
  '',
  'Some prose that must survive regeneration untouched.',
  '',
  '<!-- BEGIN GENERATED: workflow-job-runner-inventory -->',
  '',
  '| Workflow | Job | Kind | Runner | Timeout (min) |',
  '| --- | --- | --- | --- | --- |',
  '| `stale.yml` | `stale-job` | job | `self-hosted` | 5 |',
  '',
  '<!-- END GENERATED -->',
  '',
  'Trailing prose that must also survive regeneration untouched.',
  '',
].join('\n')

const caller = makeJob({ id: '.github/workflows/ci.yml#build-backend' })
const matrix = makeJob({
  id: '.github/workflows/tests-backend-unit.yml#backend-tests',
  kind: 'matrix-template',
  runsOn: ['self-hosted', 'Tests'],
})
const selfHosted = makeJob({
  id: '.github/workflows/ci.yml#gitleaks',
  runsOn: ['self-hosted'],
})
const topology: WorkflowTopology = makeTopology({
  jobs: [caller, matrix, selfHosted],
  edges: [makeCallEdge(caller.id, '.github/workflows/build-backend.yml')],
})

describe('workflow job & runner inventory', () => {
  describe('renderJobsInventoryDoc', () => {
    it('splices a freshly rendered table between the markers, leaving prose untouched', async () => {
      const output = await renderJobsInventoryDoc(FIXTURE, topology)

      expect(output).toContain('Some prose that must survive regeneration untouched.')
      expect(output).toContain('Trailing prose that must also survive regeneration untouched.')
      expect(output).not.toContain('stale.yml')
      expect(output).not.toContain('stale-job')
    })

    it('is idempotent: re-rendering its own output produces byte-identical content', async () => {
      const once = await renderJobsInventoryDoc(FIXTURE, topology)
      const twice = await renderJobsInventoryDoc(once, topology)

      expect(twice).toBe(once)
    })

    it('throws when the BEGIN/END markers are missing', async () => {
      await expect(renderJobsInventoryDoc('# No markers here\n', topology)).rejects.toThrow(
        /BEGIN GENERATED: workflow-job-runner-inventory/,
      )
    })

    it('is selected when a bounded topology report maps a workflow change to ci-tools', () => {
      const owningJob = PROJECT_TO_JOB['ci-tools']
      expect(owningJob).toBeDefined()
      const rootJobId = `${CI_WORKFLOW_PATH}#${owningJob}`
      expect(
        routeCiTopologyImpact(
          {
            schemaVersion: 1,
            baseRevision: 'base',
            headRevision: 'head',
            changedPaths: ['.github/workflows/actionlint.yml'],
            affectedWorkflows: ['.github/workflows/actionlint.yml'],
            affectedRootJobIds: [rootJobId],
            diagnostics: [],
            globalFallback: false,
          },
          {
            input: { base: 'base', head: 'head', entryWorkflow: CI_WORKFLOW_PATH },
            changedPaths: ['.github/workflows/actionlint.yml'],
            knownRootJobIds: TOPOLOGY_ROOT_JOB_IDS,
          },
        ).affectedRootJobIds,
      ).toEqual(new Set([rootJobId]))
    })

    it('renders a matrix-template job as kind "matrix"', async () => {
      const output = await renderJobsInventoryDoc(FIXTURE, topology)

      expect(output).toMatch(
        /^\|\s*`tests-backend-unit\.yml`\s*\|\s*`backend-tests`\s*\|\s*matrix\s*\|/m,
      )
    })

    it('renders a reusable-workflow caller with no runs-on as "→ callee.yml"', async () => {
      const output = await renderJobsInventoryDoc(FIXTURE, topology)

      expect(output).toMatch(
        /^\|\s*`ci\.yml`\s*\|\s*`build-backend`\s*\|\s*job\s*\|\s*→\s*`build-backend\.yml`\s*\|\s*360\s*\|$/m,
      )
    })

    it('omits the git ref from a remote reusable-workflow call target', async () => {
      const remotePin = 'a'.repeat(40)
      const remoteCaller = makeJob({
        id: '.github/workflows/opencode-zen-code-review.yml#opencode-zen-review',
      })
      const overridden = makeTopology({
        jobs: [...topology.jobs, remoteCaller],
        edges: [
          ...topology.edges,
          makeCallEdge(
            remoteCaller.id,
            `vouchington/vouchington-tooling/.github/workflows/opencode-code-review.yml@${remotePin}`,
            { local: false },
          ),
        ],
      })

      const output = await renderJobsInventoryDoc(FIXTURE, overridden)

      expect(output).toMatch(
        /^\|\s*`opencode-zen-code-review\.yml`\s*\|\s*`opencode-zen-review`\s*\|\s*job\s*\|\s*→\s*`vouchington\/vouchington-tooling\/\.github\/workflows\/opencode-code-review\.yml`\s*\|/m,
      )
      expect(output).not.toContain(remotePin)
    })

    it('renders an array-shaped runs-on as a joined, backtick-wrapped label list', async () => {
      const output = await renderJobsInventoryDoc(FIXTURE, topology)

      expect(output).toMatch(
        /^\|\s*`tests-backend-unit\.yml`\s*\|\s*`backend-tests`\s*\|\s*matrix\s*\|\s*`self-hosted`, `Tests`\s*\|/m,
      )
    })

    it('renders a job with no declared timeout-minutes as the 360-minute default', async () => {
      const output = await renderJobsInventoryDoc(FIXTURE, topology)

      expect(output).toMatch(/^\|\s*`ci\.yml`\s*\|\s*`gitleaks`\s*\|.*\|\s*360\s*\|$/m)
    })

    it('renders a runner-group runs-on, with and without labels', async () => {
      const groupOnly = makeJob({
        id: '.github/workflows/synthetic.yml#group-only',
        runsOn: { group: 'my-runner-group' },
      })
      const groupLabeled = makeJob({
        id: '.github/workflows/synthetic.yml#group-labeled',
        runsOn: { group: 'my-runner-group', labels: ['label-a', 'label-b'] },
      })
      const overridden = makeTopology({
        jobs: [...topology.jobs, groupOnly, groupLabeled],
        edges: topology.edges,
      })

      const output = await renderJobsInventoryDoc(FIXTURE, overridden)

      expect(output).toMatch(
        /^\|\s*`synthetic\.yml`\s*\|\s*`group-only`\s*\|\s*job\s*\|\s*group: `my-runner-group`\s*\|/m,
      )
      expect(output).toMatch(
        /^\|\s*`synthetic\.yml`\s*\|\s*`group-labeled`\s*\|\s*job\s*\|\s*group: `my-runner-group` \(labels: `label-a`, `label-b`\)\s*\|/m,
      )
    })

    it('throws when a job has no runs-on and no matching reusable-workflow call edge', async () => {
      const orphaned = makeJob({ id: '.github/workflows/synthetic.yml#orphaned' })
      const overridden = makeTopology({ jobs: [...topology.jobs, orphaned], edges: topology.edges })

      await expect(renderJobsInventoryDoc(FIXTURE, overridden)).rejects.toThrow(
        /synthetic\.yml#orphaned has no runs-on and no reusable-workflow call edge/,
      )
    })
  })

  describe('writeJobsInventoryDoc', () => {
    const paths: string[] = []

    async function tempDocPath(content: string): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), 'jobs-inventory-doc-'))
      const docPath = join(dir, 'JOBS.md')
      await writeFile(docPath, content)
      paths.push(docPath)
      return docPath
    }

    afterEach(async () => {
      await Promise.all(
        paths.splice(0).map(docPath => rm(join(docPath, '..'), { force: true, recursive: true })),
      )
    })

    it('writes the regenerated table to docPath', async () => {
      const docPath = await tempDocPath(FIXTURE)

      await writeJobsInventoryDoc({ docPath, topology })

      const written = await readFile(docPath, 'utf8')
      expect(written).not.toContain('stale.yml')
      expect(written).toContain('Some prose that must survive regeneration untouched.')
    })

    it('resolves without throwing in check mode once the file has been regenerated', async () => {
      const docPath = await tempDocPath(FIXTURE)
      await writeJobsInventoryDoc({ docPath, topology })

      await expect(
        writeJobsInventoryDoc({ check: true, docPath, topology }),
      ).resolves.toBeUndefined()
    })

    it('throws naming the stale docPath and the regenerate command when content has drifted', async () => {
      const docPath = await tempDocPath(FIXTURE)

      await expect(writeJobsInventoryDoc({ check: true, docPath, topology })).rejects.toThrow(
        docPath,
      )
      await expect(writeJobsInventoryDoc({ check: true, docPath, topology })).rejects.toThrow(
        /render-workflow-runner-inventory\.mts/,
      )
    })

    it('does not write the file in check mode, even when it is stale', async () => {
      const docPath = await tempDocPath(FIXTURE)

      await expect(writeJobsInventoryDoc({ check: true, docPath, topology })).rejects.toThrow(
        /stale/,
      )
      const untouched = await readFile(docPath, 'utf8')
      expect(untouched).toBe(FIXTURE)
    })
  })
})
