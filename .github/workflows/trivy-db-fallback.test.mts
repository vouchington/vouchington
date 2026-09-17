import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowStep = {
  'continue-on-error'?: boolean
  env?: Record<string, string>
  name?: string
  run?: string
  'timeout-minutes'?: number
}

type Workflow = {
  jobs?: {
    build?: {
      steps?: WorkflowStep[]
    }
  }
  runs?: {
    steps?: WorkflowStep[]
  }
}

function buildSteps(path: string): WorkflowStep[] {
  const workflow = load(readFileSync(path, 'utf8')) as Workflow
  return workflow.jobs?.build?.steps ?? workflow.runs?.steps ?? []
}

describe('Trivy database fallback workflow contract', () => {
  // build-backend.yml and build-web.yml each delegate their image build, smoke tests, and Trivy
  // gate to a composite action, which is shared with the matching publish-*-images.yml workflow.
  const buildWorkflowPaths = [
    '.github/actions/build-backend-images/action.yml',
    '.github/actions/build-web-images/action.yml',
  ]

  it('prepares the database through the shared hard-failing helper', () => {
    for (const path of buildWorkflowPaths) {
      const prepareStep = buildSteps(path).find(step => step.name === 'Prepare Trivy database')

      expect(prepareStep?.run).toBe('./ci/prepare-trivy-db.sh')
      expect(prepareStep?.['continue-on-error']).toBeUndefined()
    }

    const wrapper = readFileSync('ci/prepare-trivy-db.sh', 'utf8')
    expect(wrapper).toContain('vouchington-tooling-script.sh')
    expect(wrapper).toContain('scripts/gha/prepare-trivy-db.sh')
    const packaged = execFileSync(
      'bash',
      ['ci/vouchington-tooling-script.sh', 'scripts/gha/prepare-trivy-db.sh'],
      { encoding: 'utf8' },
    )
    expect(readFileSync(packaged, 'utf8')).toContain('TRIVY_DB_TIMEOUT:-75s')
  })

  it('prevents vulnerability and SBOM scans from updating the prepared database', () => {
    for (const path of buildWorkflowPaths) {
      const trivySteps = buildSteps(path).filter(
        step => step.name?.includes('Trivy') || step.name?.includes('SBOM'),
      )
      const imageScanSteps = trivySteps.filter(step => step.run?.includes('trivy image'))

      expect(imageScanSteps.length).toBeGreaterThanOrEqual(2)
      for (const step of imageScanSteps) expect(step.run).toContain('--skip-db-update')
    }
  })

  it('uses a dedicated findings exit code and reports operational failures separately', () => {
    for (const path of buildWorkflowPaths) {
      const scanStep = buildSteps(path).find(step => step.name?.startsWith('Scan'))

      expect(scanStep?.env?.TRIVY_FINDINGS_EXIT_CODE).toBe('10')
      expect(scanStep?.run).toContain('--exit-code "$TRIVY_FINDINGS_EXIT_CODE"')
      expect(scanStep?.run).toContain('title=Trivy scanner error')
      expect(scanStep?.run).toContain('CRITICAL/HIGH fixable OS vulnerabilities')
    }
  })

  it('routes helper changes through both PR and main image builds', () => {
    const ciPathFilters = readFileSync('.github/ci-path-filters.yml', 'utf8')
    const mainWebWorkflow = readFileSync('.github/workflows/main-web.yml', 'utf8')
    const mainBackendWorkflow = readFileSync('.github/workflows/main-backend.yml', 'utf8')

    expect(ciPathFilters.match(/ci\/prepare-trivy-db\.sh/g)).toHaveLength(4)
    expect(mainWebWorkflow).toContain("- 'ci/prepare-trivy-db.sh'")
    expect(mainBackendWorkflow).toContain("- 'ci/prepare-trivy-db.sh'")
  })
})
