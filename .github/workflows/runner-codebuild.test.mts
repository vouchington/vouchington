import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type Workflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
    }
  >
}

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('CodeBuild runner routing', () => {
  it('defaults image builds to Ubicloud in every context, with CodeBuild as an opt-in escape hatch', () => {
    // Ubicloud is now the default runner for build-backend/build-web on every ref, including
    // main. CodeBuild is reachable only via the fleet-wide
    // vars.CI_IMAGE_BUILDS_ON_CODEBUILD window or the per-PR codebuild:images label, and uses
    // the sizes proven safe before this workflow ever right-sized the escape hatch (backend
    // xlarge, web large) rather than the smaller sizes trialed and reverted during validation
    // — see RUNNERS.md § build-image-runner decision.
    const backendRunsOn = readWorkflow('.github/workflows/build-backend.yml').jobs?.build?.[
      'runs-on'
    ]
    expect(backendRunsOn).toMatch(
      /format\('codebuild-voucha-ci-runner-\{0\}-\{1\} image:arm-3\.0 instance-size:xlarge', github\.run_id, github\.run_attempt\)/,
    )
    expect(backendRunsOn).toContain("vars.CI_IMAGE_BUILDS_ON_CODEBUILD == 'true'")
    expect(backendRunsOn).toContain(
      "contains(github.event.pull_request.labels.*.name, 'codebuild:images')",
    )
    expect(backendRunsOn).toContain("|| 'ubicloud-standard-8-arm'")

    const webRunsOn = readWorkflow('.github/workflows/build-web.yml').jobs?.build?.['runs-on']
    expect(webRunsOn).toMatch(
      /format\('codebuild-voucha-ci-runner-\{0\}-\{1\} image:arm-3\.0 instance-size:large', github\.run_id, github\.run_attempt\)/,
    )
    expect(webRunsOn).toContain("vars.CI_IMAGE_BUILDS_ON_CODEBUILD == 'true'")
    expect(webRunsOn).toContain(
      "contains(github.event.pull_request.labels.*.name, 'codebuild:images')",
    )
    expect(webRunsOn).toContain("|| 'ubicloud-standard-4-arm'")
  })
})
