import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflowText = readFileSync('.github/workflows/pnpm-dedupe.yml', 'utf8')

type Step = {
  name?: string
  id?: string
  if?: string
  uses?: string
  env?: Record<string, string>
  run?: string
  with?: Record<string, unknown>
}

type WorkflowJob = {
  'runs-on'?: string | string[]
  steps?: Step[]
}

type Workflow = {
  jobs?: Record<string, WorkflowJob>
}

const parsed = load(workflowText) as Workflow

describe('pnpm-dedupe workflow', () => {
  it('does not persist the write PAT into pnpm lifecycle script environment', () => {
    const dedupeJob = parsed.jobs?.['dedupe']
    const checkoutStep = dedupeJob?.steps?.find(s => s.uses?.includes('actions/checkout'))
    const pushStep = dedupeJob?.steps?.find(s => s.name === 'Commit and push')

    // Checkout uses the read-only GITHUB_TOKEN without persisting it, so pnpm install/dedupe
    // lifecycle scripts never see a credential; only the push step receives the PAT.
    expect(checkoutStep?.with?.['persist-credentials']).toBe(false)
    expect(checkoutStep?.with).not.toHaveProperty('token')

    expect(pushStep?.run).toContain('-c core.hooksPath=/dev/null commit')

    // The push step must inject the token only for that one git invocation.
    expect(pushStep?.env?.['TOKEN']).toBe('${{ secrets.DEPENDABOT_AUTOMERGE_TOKEN }}')
    // Token must be passed via GIT_CONFIG_* env vars (not git -c argv) so it does not appear in
    // /proc/PID/cmdline (world-readable); GIT_CONFIG_* keeps it in /proc/PID/environ (owner-only).
    expect(pushStep?.run).toContain('GIT_CONFIG_KEY_0=http.extraheader')
    expect(pushStep?.run).toContain('-c core.hooksPath=/dev/null push')

    // No bare git push that relies on persisted creds (git push must not start a line — the
    // GIT_CONFIG_* env var assignment precedes it on the same logical line).
    expect(pushStep?.run).not.toMatch(/^[ \t]*git push/m)
  })

  it('owner-qualifies the PR existence check to prevent fork branch name collision', () => {
    const dedupeJob = parsed.jobs?.['dedupe']
    const openPrStep = dedupeJob?.steps?.find(s => s.name === 'Open PR if missing')

    // Must expose the repo owner as a trusted env constant.
    expect(openPrStep?.env?.['OWNER']).toBe('${{ github.repository_owner }}')

    // The run script must filter by both headRepositoryOwner and headRefName so a fork PR
    // named chore/pnpm-dedupe cannot prevent the canonical PR from being created.
    expect(openPrStep?.run).toContain('headRepositoryOwner')
    expect(openPrStep?.run).toContain('headRefName')
    expect(openPrStep?.run).toContain('$OWNER')

    // The old unqualified lookup must not exist.
    expect(workflowText).not.toContain("--jq '.[0].number'")
  })
})
