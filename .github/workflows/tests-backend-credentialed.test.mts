import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-backend-credentialed.yml', 'utf8')

function jobSection(jobName: string): string {
  const start = workflow.indexOf(`\n  ${jobName}:`)
  if (start < 0) throw new Error(`job not found: ${jobName}`)
  const rest = workflow.slice(start + 1)
  const next = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/)
  return next === -1 ? rest : rest.slice(0, next)
}

function stepSection(job: string, stepName: string): string {
  const nameIndex = job.indexOf(`name: ${stepName}`)
  if (nameIndex < 0) throw new Error(`step not found: ${stepName}`)
  const start = job.lastIndexOf('\n      - ', nameIndex)
  if (start < 0) throw new Error(`step boundary not found: ${stepName}`)
  const rest = job.slice(start + 1)
  const next = rest.indexOf('\n      - ', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('backend credentialed test workflow', () => {
  it('combines aws, bedrock, openai, openrouter, and stripe projects in one job', () => {
    const credentialedJob = jobSection('backend-credentialed-tests')
    expect(credentialedJob).toContain('if: ${{ inputs.trusted_secret_context }}')
    expect(credentialedJob).toContain('AWS_REGION: us-west-2')
    expect(credentialedJob).toContain('AWS_TEST_ROLE_ARN: ${{ secrets.AWS_TEST_ROLE_ARN }}')
    expect(credentialedJob).toContain("REQUIRE_BEDROCK_INTEGRATION: ''")

    expect(credentialedJob).toContain('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}')
    expect(credentialedJob).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}')
    expect(credentialedJob).toContain('STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}')
    expect(credentialedJob).toContain('.github/actions/setup-aws')
    expect(credentialedJob).toContain(
      'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend-aws --project backend-bedrock --project backend-openai --project backend-openrouter --project backend-stripe "${FILES[@]}"',
    )
    expect(credentialedJob).toContain(
      "VITEST_COVERAGE_ENABLED: ${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(credentialedJob).toContain(
      'VITEST_BLOB_OUTPUT_FILE: .vitest-reports/backend-credentialed.json',
    )
    const vitestBlobFallback = stepSection(
      credentialedJob,
      'Upload backend-credentialed vitest blob to GitHub (fallback)',
    )
    expect(vitestBlobFallback).toContain('uses: ./.github/actions/upload-vitest-blob')
    expect(vitestBlobFallback).toContain('suite: backend-credentialed')
    const fallback = stepSection(
      credentialedJob,
      'Upload backend-credentialed coverage pair to GitHub (fallback attempt 1)',
    )
    expect(fallback).toContain('uses: ./.github/actions/upload-coverage-pair')
    expect(fallback).toContain('suite: backend-credentialed')
    expect(fallback).toContain('continue-on-error: true')
    expect(credentialedJob).toContain('fallback attempt 2')
    expect(workflow).not.toContain('backend-aws-tests:')
    expect(workflow).not.toContain('backend-openai-tests:')
    expect(workflow).not.toContain('backend-openrouter-tests:')
    expect(workflow).not.toContain('backend-stripe-tests:')
  })

  it('does not shard the credentialed job', () => {
    expect(workflow).not.toContain('--project backend-aws --shard')
    expect(workflow).not.toContain('--project backend-openai --shard')
    expect(workflow).not.toContain('--project backend-bedrock --shard')
    expect(workflow).not.toContain('--project backend-stripe --shard')
  })

  it('gates the job on trusted_secret_context', () => {
    expect(workflow).toContain('inputs.trusted_secret_context')
    expect(workflow).toContain('OPENAI_API_KEY:\n        required: false')
    expect(workflow).toContain('OPENROUTER_API_KEY:\n        required: false')
    expect(workflow).toContain('STRIPE_SECRET_KEY:\n        required: false')
  })
})
