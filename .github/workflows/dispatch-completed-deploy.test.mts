import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  env?: Record<string, string>
  if?: string
  name?: string
  run?: string
  uses?: string
}
type Job = { if?: string; permissions?: Record<string, string>; steps?: Step[] }
type Workflow = { jobs?: Record<string, Job>; on?: Record<string, unknown>; permissions?: object }

const workflow = load(
  readFileSync('.github/workflows/dispatch-completed-deploy.yml', 'utf8'),
) as Workflow
const dispatch = workflow.jobs?.dispatch

describe('completed deploy dispatch', () => {
  it('accepts only successful trusted default-branch source workflow completions', () => {
    expect(workflow.on?.workflow_run).toEqual({
      workflows: [
        'Docs Publish',
        'Main CI (backend)',
        'Main CI (cloudflare-worker)',
        'Main CI (lambdas)',
        'Main CI (storybook)',
        'Main CI (web)',
        'Sync Articles',
      ],
      types: ['completed'],
    })
    expect(dispatch?.if).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(dispatch?.if).toContain("github.event.workflow_run.event == 'push'")
    expect(dispatch?.if).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    )
    expect(dispatch?.if).toContain(
      'github.event.workflow_run.head_branch == github.event.repository.default_branch',
    )
  })

  it('maps each source path to one route-specific event and keeps the five-field contract', () => {
    const intent = dispatch?.steps?.find(step => step.name === 'Check route deployment intent')
    const source = dispatch?.steps?.find(step => step.name === 'Map completed source workflow')
    const token = dispatch?.steps?.find(
      step => step.name === 'Mint vouchington-infra dispatch token',
    )
    const send = dispatch?.steps?.find(
      step => step.name === 'Dispatch source revision to vouchington-infra',
    )
    const serialized = JSON.stringify(workflow)

    const expectedRoutes = [
      {
        path: 'docs-publish',
        sourceWorkflow: 'docs-publish',
        eventType: 'filaments-publish-docs-v2',
      },
      {
        path: 'main-backend',
        sourceWorkflow: 'main-backend',
        eventType: 'filaments-deploy-backend-v2',
      },
      {
        path: 'main-cloudflare-worker',
        sourceWorkflow: 'main-cloudflare-worker',
        eventType: 'filaments-deploy-cloudflare-worker-v2',
      },
      {
        path: 'main-lambdas',
        sourceWorkflow: 'main-lambdas',
        eventType: 'filaments-deploy-lambdas-v2',
      },
      {
        path: 'main-storybook',
        sourceWorkflow: 'main-storybook',
        eventType: 'filaments-publish-storybook-v2',
      },
      { path: 'main-web', sourceWorkflow: 'main-web', eventType: 'filaments-deploy-web-v2' },
      {
        path: 'sync-articles',
        sourceWorkflow: 'sync-articles',
        eventType: 'filaments-publish-articles-v2',
      },
    ]

    const mappedRoutes = [
      ...(source?.run?.matchAll(/\.github\/workflows\/([^)\n]+)\)\n([\s\S]*?)\n\s+;;/g) ?? []),
    ].map(([, path, body]) => ({
      path: path.replace(/\.yml$/u, ''),
      sourceWorkflow: body.match(/source_workflow=([^']+)/u)?.[1],
      eventType: body.match(/event_type=([^']+)/u)?.[1],
    }))

    expect(mappedRoutes).toEqual(expectedRoutes)
    expect(dispatch?.permissions).toEqual({ actions: 'read' })
    expect(intent?.run).toContain('.github/workflows/main-web.yml')
    expect(intent?.run).toContain('.name == "web-deploy-intent"')
    expect(intent?.run).toContain('.conclusion == "success"')
    expect(intent?.run).toContain('filter=all')
    expect(intent?.run).not.toContain('filter=latest')
    expect(intent?.run).toContain('[ "$successful_intent_jobs" = 0 ]')
    expect(intent?.run).toContain('should_dispatch=false')
    for (const step of [source, token, send]) {
      expect(step?.if).toBe("steps.intent.outputs.should_dispatch == 'true'")
    }
    expect(token?.uses).toMatch(/^actions\/create-github-app-token@[a-f0-9]{40}$/)
    expect(send?.run).toContain('--arg event_type "$DISPATCH_EVENT_TYPE"')
    expect(send?.run?.match(/gh api --method POST/g)).toHaveLength(1)
    expect(
      send?.run
        ?.split('\n')
        .find(line => line.includes('event_type:'))
        ?.trim(),
    ).toBe(
      `'{event_type: $event_type, client_payload: {source_repository: $source_repository, source_revision: $source_revision, source_workflow: $source_workflow, source_run_id: $source_run_id, source_run_attempt: $source_run_attempt}}' |`,
    )
    expect(send?.env).toEqual({
      DISPATCH_EVENT_TYPE: '${{ steps.source.outputs.event_type }}',
      GH_TOKEN: '${{ steps.app-token.outputs.token }}',
      SOURCE_REPOSITORY: '${{ github.event.workflow_run.head_repository.full_name }}',
      SOURCE_REVISION: '${{ github.event.workflow_run.head_sha }}',
      SOURCE_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
      SOURCE_RUN_ID: '${{ github.event.workflow_run.id }}',
      SOURCE_WORKFLOW: '${{ steps.source.outputs.source_workflow }}',
    })
    expect(serialized).not.toMatch(/artifact|manifest|s3|aws|poll|retry|mask|workflow_dispatch/iu)
    expect(serialized).not.toContain('filaments-deploy-v1')
  })

  it('keeps broad web validation triggers while marking only web deploy changes', () => {
    const source = readFileSync('.github/workflows/main-web.yml', 'utf8')
    const mainWeb = load(source) as Workflow
    const serialized = JSON.stringify(mainWeb)

    expect(serialized).toContain('cloudflare-worker/**')
    expect(serialized).toContain('lambdas/image-resize/**')
    expect(serialized).toContain('detect-web-deploy')
    expect(serialized).toContain('web-deploy-intent')
    expect(serialized).toContain('git diff --no-renames --name-only')
    expect(source).toContain('changed_files=$(git diff --no-renames --name-only')
    expect(source).toContain('<<<"$changed_files"')
    expect(source).not.toContain('"$AFTER" | grep')
    expect(serialized).toContain('backend/types/')
    expect(serialized).toContain('ts-shared/')
    expect(serialized).not.toContain("'cloudflare-worker/'")
    expect(serialized).not.toContain("'lambdas/'")
  })
})
