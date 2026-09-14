import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('post-cutover deployment documentation', () => {
  it('reports staging live and production unavailable in every deployment leaf', () => {
    const platform = read('docs/overview/infrastructure/reference-deployment-platform.md')
    const staticAssets = read(
      'docs/overview/infrastructure/reference-deployment-s3-static-assets.md',
    )
    const firstTime = read(
      'docs/overview/infrastructure/reference-deployment-first-time-provisioning-checklist.md',
    )
    const ciCd = read('docs/overview/infrastructure/reference-deployment-ci-cd-flow.md').replace(
      /\s+/g,
      ' ',
    )
    const workflowReference = read('.github/workflows/reference-deploy-and-release.md').replace(
      /\s+/g,
      ' ',
    )

    expect(platform).toContain('Live through the private infrastructure deployment receiver')
    expect(platform).not.toContain('receiver disabled during cutover')
    expect(staticAssets).toContain('Staging deployment is live')
    expect(staticAssets).not.toContain('Staging deployment is intentionally disabled')
    expect(firstTime).toContain('production promotion and rollback are not live')
    expect(firstTime).not.toContain('smoke test → promote to production')
    expect(ciCd).toContain('The global CI apply workflow and its trust')
    expect(workflowReference).toContain('The global CI apply workflow and its trust')
  })

  it('keeps staging credentials and private verification procedures out of public docs', () => {
    const runbook = read('docs/operations/cloudflare-worker-staging-auth.md')

    expect(runbook).toContain('private `vouchington-infra` operator runbooks')
    expect(runbook).toContain(
      'Treat Worker access credentials and access-control configuration as secrets.',
    )
    expect(runbook).toContain('After an authorized staging change')
    expect(runbook).toContain('without recording credentials')
    expect(runbook).toContain(
      'If any check fails, stop the rollout and use the private rollback procedure.',
    )
    expect(runbook).not.toContain('auth_config')
    expect(runbook).not.toContain('canary_config')
    expect(runbook).not.toContain('STAGING_USER')
    expect(runbook).not.toContain('STAGING_CANARY_SECRET')
    expect(runbook).not.toContain('curl ')
  })

  it('uses exact saved-plan authorization for global recovery', () => {
    const recovery = read(
      'docs/operations/reference-private-docs-site-rotation-and-recovery.md',
    ).replace(/\s+/g, ' ')

    expect(recovery).toContain('operator-controlled procedure')
    expect(recovery).toContain('separate authorization for that exact plan')
    expect(recovery).toContain('global CI apply workflow and its trust remain disabled')
    expect(recovery).not.toContain('full global plan/apply workflow')
  })

  it('routes staging database resets to the private operator runbook', () => {
    const stagingQa = read('.agents/skills/staging-qa/SKILL.md').replace(/\s+/g, ' ')
    const ciCd = read('docs/overview/infrastructure/reference-deployment-ci-cd-flow.md').replace(
      /\s+/g,
      ' ',
    )
    const migrationPolicy = read(
      'backend/data-stores/psql/reference-migrations-views-and-config-driven.md',
    ).replace(/\s+/g, ' ')
    const schemaSnapshot = read('backend/data-stores/psql/schema-snapshot/README.md').replace(
      /\s+/g,
      ' ',
    )
    const resetRunbook =
      'https://github.com/vouchington/vouchington-infra/blob/main/opentofu/reference-human_checklist-phase-10-first-deploy.md#staging-database-reset' // pinned to vouchington-infra#47; update both docs if the private runbook moves
    const retainedScope =
      'Valkey, queues, object storage, analytics warehouse/event data, and infrastructure state'

    for (const document of [stagingQa, ciCd, migrationPolicy, schemaSnapshot]) {
      expect(document).toContain(resetRunbook)
      expect(document).toContain('requires organization access')
      expect(document).not.toContain('.github/workflows/reset-staging-database.yml')
      expect(document).not.toContain('reset-on-failure')
      expect(document).not.toContain(
        'staging resets through the infrastructure deployment workflow',
      )
    }

    for (const document of [stagingQa, ciCd]) {
      expect(document).toContain(retainedScope)
      expect(document).not.toContain('Until the private repository delivers')
      expect(document).not.toContain('Track the missing operator capability')
    }

    expect(stagingQa).toContain('`200`/`pong`')
    expect(ciCd).toContain('manual-only staging database reset')
    expect(ciCd).toContain('not a receiver rerun')
    expect(ciCd).toContain(
      'deploy/apply admission, service quiescence, recovery evidence, and restoration',
    )
  })
})
