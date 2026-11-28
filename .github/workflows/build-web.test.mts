import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = {
  'continue-on-error'?: boolean
  if?: string
  name?: string
  run?: string
}

type CompositeAction = { runs?: { steps?: Step[] } }

// The image build, smoke test, and Trivy gate all live in the composite action used by the unified
// validation/publication workflow.
function readBuildWebImagesSteps(): Step[] {
  const action = load(
    readFileSync('.github/actions/build-web-images/action.yml', 'utf8'),
  ) as CompositeAction
  return (action.runs?.steps ?? []).map(step => {
    const source = /^source "\$GITHUB_ACTION_PATH\/([a-z-]+\.sh)"$/u.exec(step.run ?? '')
    return source?.[1]
      ? { ...step, run: readFileSync(`.github/actions/build-web-images/${source[1]}`, 'utf8') }
      : step
  })
}

describe('web image workflow', () => {
  it('keeps the Sentry token out of validation builds and image layers', () => {
    const compositeActionSource = readFileSync(
      '.github/actions/build-web-images/action.yml',
      'utf8',
    )
    const ciSource = readFileSync('.github/workflows/web.yml', 'utf8')

    const validationJob = ciSource
      .split('\n  validate-web-images:')[1]
      ?.split('\n  publish-web-images:')[0]
    expect(validationJob).toBeDefined()
    expect(validationJob).not.toContain('SENTRY_AUTH_TOKEN')
    expect(compositeActionSource).not.toContain('ARG SENTRY_AUTH_TOKEN')
    expect(compositeActionSource).not.toContain('ENV SENTRY_AUTH_TOKEN')
  })

  it('fails the build when the Trivy install guard or OS scan fails', () => {
    const steps = readBuildWebImagesSteps()
    const guard = steps.find(step => step.name === 'Trivy install guard')
    const scan = steps.find(step => step.name === 'Scan OS packages in web image with Trivy')
    expect(guard).toBeDefined()
    expect(scan).toBeDefined()
    expect(guard?.['continue-on-error']).toBeUndefined()
    expect(scan?.['continue-on-error']).toBeUndefined()
    // Exact expression: `||` instead of `&&` would run the guard when Install Trivy was skipped.
    expect(guard?.if).toBe("${{ !cancelled() && steps.install-trivy.outcome != 'skipped' }}")
    // Without a findings exit code Trivy exits 0 on findings, and the re-raise below re-raises 0.
    expect(scan?.run).toContain('--exit-code "$TRIVY_FINDINGS_EXIT_CODE"')
    // The captured exit code must actually be re-raised, not just logged.
    expect(scan?.run).toContain('exit "$trivy_exit"')
  })
})
