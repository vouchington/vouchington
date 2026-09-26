import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  name?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}
type Job = {
  if?: string
  needs?: string[]
  permissions?: Record<string, string>
  services?: { postgres?: { image?: string } }
  steps?: Step[]
}
type Workflow = {
  on?: {
    issue_comment?: { types?: string[] }
    workflow_dispatch?: { inputs?: Record<string, unknown> }
  }
  permissions?: Record<string, string>
  jobs?: Record<string, Job>
}

const workflow = load(
  readFileSync('.github/workflows/postgresql-snapshot-update.yml', 'utf8'),
) as Workflow
const prepare = workflow.jobs?.prepare
const generate = workflow.jobs?.generate
const publish = workflow.jobs?.publish

describe('PostgreSQL snapshot update workflow', () => {
  it('accepts PR comments and manual PR dispatch through a read-only authorization job', () => {
    expect(workflow.on?.issue_comment?.types).toEqual(['created'])
    expect(workflow.on?.workflow_dispatch?.inputs?.pr_number).toBeDefined()
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(
      prepare?.steps?.some(step => step.run?.includes('postgresql-snapshot-update.mts prepare')),
    ).toBe(true)
    expect(prepare?.steps?.every(step => !step.env?.SNAPSHOT_PUBLISH_TOKEN)).toBe(true)
  })

  it('runs PR-head migrations in an isolated read-only PostgreSQL job and packages from trusted code', () => {
    expect(generate?.needs).toEqual(['prepare'])
    expect(generate?.permissions).toEqual({ contents: 'read' })
    expect(generate?.services?.postgres?.image).toBe('${{ needs.prepare.outputs.postgres_image }}')
    expect(
      generate?.steps?.find(step => step.name === 'Generate snapshot from fresh PostgreSQL')?.run,
    ).toContain('applyAllMigrations()')
    expect(
      generate?.steps?.find(step => step.name === 'Generate snapshot from fresh PostgreSQL')?.run,
    ).not.toContain('runAllMigrations()')
    expect(
      generate?.steps?.find(step => step.name === 'Package generated snapshot with provenance')
        ?.run,
    ).toContain('.trusted-snapshot-tooling/ci/postgresql-snapshot-update.mts manifest')
    expect(generate?.steps?.every(step => !step.env?.SNAPSHOT_PUBLISH_TOKEN)).toBe(true)
    expect(generate?.steps?.some(step => step.uses?.startsWith('./'))).toBe(false)
    expect(
      generate?.steps?.filter(step => step.run === 'pnpm install --frozen-lockfile'),
    ).toHaveLength(1)
    expect(generate?.steps?.filter(step => step.uses?.startsWith('actions/cache'))).toEqual([
      expect.objectContaining({
        uses: expect.stringMatching(/^actions\/cache\/restore@[a-f0-9]{40}$/),
      }),
    ])
  })

  it('publishes only after a successful artifact handoff through trusted default-branch code', () => {
    expect(publish?.needs).toEqual(['prepare', 'generate'])
    expect(publish?.if).toContain("needs.generate.result == 'success'")
    const download = publish?.steps?.find(step =>
      step.uses?.startsWith('actions/download-artifact@'),
    )
    expect(download?.with).toMatchObject({
      name: 'postgresql-snapshot-pr-${{ needs.prepare.outputs.pr_number }}-run-${{ github.run_id }}-attempt-${{ github.run_attempt }}',
      'github-token': '${{ github.token }}',
      repository: '${{ github.repository }}',
      'run-id': '${{ github.run_id }}',
    })
    expect(
      generate?.steps?.find(step => step.uses?.startsWith('actions/upload-artifact@'))?.with?.name,
    ).toBe(download?.with?.name)
    const publication = publish?.steps?.find(
      step => step.name === 'Validate and publish generated snapshot',
    )
    expect(publication?.env?.SNAPSHOT_PUBLISH_TOKEN).toBe(
      '${{ secrets.DEPENDABOT_AUTOMERGE_TOKEN }}',
    )
    expect(publication?.run).toBe('node ci/postgresql-snapshot-update.mts publish')
    expect(publish?.steps?.filter(step => step.env?.SNAPSHOT_PUBLISH_TOKEN)).toHaveLength(1)
  })
})
