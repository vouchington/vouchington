import { describe, expect, it } from 'vitest'

import { parsedDependabot as parsed, workflowText } from './fix-dependabot.test-helpers.mts'

const eventInputs = {
  EVENT_HEAD_SHA: '${{ github.event.workflow_run.head_sha }}',
  HEAD_BRANCH: '${{ github.event.workflow_run.head_branch }}',
  PR_NUMBER: '${{ github.event.workflow_run.pull_requests[0].number }}',
  SOURCE_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
  SOURCE_RUN_CONCLUSION: '${{ github.event.workflow_run.conclusion }}',
  SOURCE_RUN_ID: '${{ github.event.workflow_run.id }}',
}

describe('fix-dependabot rerun routes', () => {
  it('keeps the preliminary source guard ahead of transient classification', () => {
    const triageJob = parsed.jobs?.['triage-and-rerun']
    const setup = triageJob?.steps?.find(s => s.uses?.endsWith('/setup-node-pnpm'))
    const sourceState = triageJob?.steps?.find(s => s.id === 'source-state')
    const decide = triageJob?.steps?.find(s => s.id === 'decide')
    const stepIds = triageJob?.steps?.map(s => s.id).filter(Boolean)

    expect(setup).toBeDefined()
    expect(stepIds?.indexOf('source-state')).toBeLessThan(stepIds?.indexOf('decide') ?? -1)
    expect(sourceState?.if).toBeUndefined()
    expect(sourceState?.run).toBe('node ci/source-run-state.mts')
    expect(sourceState?.env).toMatchObject({
      SOURCE_RUN_ATTEMPT: eventInputs.SOURCE_RUN_ATTEMPT,
      SOURCE_RUN_CONCLUSION: eventInputs.SOURCE_RUN_CONCLUSION,
      SOURCE_RUN_ID: eventInputs.SOURCE_RUN_ID,
    })
    expect(decide?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(decide?.env?.['WORKFLOW_RUN_ID']).toBe(eventInputs.SOURCE_RUN_ID)
    expect(decide?.env?.['WORKFLOW_NAME']).toContain('github.event.workflow_run.name')
    expect(decide?.run).toBe('node ci/transient-retry/decide.mts')
  })

  it('routes both transient catalogue paths through one event-bound revalidation helper', () => {
    const triageJob = parsed.jobs?.['triage-and-rerun']
    const targeted = triageJob?.steps?.find(s => s.name === 'Rerun targeted job on transient match')
    const full = triageJob?.steps?.find(s => s.name === 'Rerun workflow on transient match')

    expect(targeted?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun' && steps.decide.outputs.rerun_job_id != ''",
    )
    expect(full?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun' && steps.decide.outputs.rerun_job_id == ''",
    )
    for (const step of [targeted, full]) {
      expect(step?.run).toContain('node ci/revalidate-dependabot-rerun.mts')
      expect(step?.env).toMatchObject(eventInputs)
    }
    expect(targeted?.env?.['RERUN_JOB_ID']).toBe('${{ steps.decide.outputs.rerun_job_id }}')
    expect(full?.env).not.toHaveProperty('RERUN_JOB_ID')
  })

  it('routes the uncatalogued first-attempt fallback through the same helper before exiting', () => {
    const triageJob = parsed.jobs?.['triage-and-rerun']
    const triage = triageJob?.steps?.find(s => s.id === 'triage')
    const script = triage?.run ?? ''
    const staleCheckIndex = script.indexOf('"$SOURCE_STATE_CURRENT" != "true"')
    const helperIndex = script.indexOf('node ci/revalidate-dependabot-rerun.mts')

    expect(triageJob?.outputs?.['pr_number']).toContain('steps.triage.outputs.pr_number')
    expect(triage?.env).toMatchObject(eventInputs)
    expect(triage?.env?.['SOURCE_STATE_CURRENT']).toContain('steps.source-state.outputs.current')
    expect(triage?.env?.['TRANSIENT_DECISION']).toContain('steps.decide.outputs.decision')
    expect(script).toContain('Transient retry rule matched')
    expect(script).toContain('Transient retry rule chose ignore')
    expect(script).toContain('Uncatalogued $CONCLUSION on attempt 1')
    expect(script).toContain('echo "should_dispatch=false" >> "$GITHUB_OUTPUT"')
    expect(script).toContain('should_dispatch=true')
    expect(staleCheckIndex).toBeGreaterThan(-1)
    expect(staleCheckIndex).toBeLessThan(helperIndex)
    expect(workflowText).not.toContain('gh run rerun')
  })
})
