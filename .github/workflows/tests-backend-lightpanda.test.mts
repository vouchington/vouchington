import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it, onTestFinished } from 'vitest'
import { SECRET_INVENTORY } from './workflow-secrets-inventory.mts'

type Workflow = {
  on: { workflow_call?: { secrets?: Record<string, { required?: boolean }> } }
  jobs: Record<
    string,
    {
      if?: string
      secrets?: Record<string, string>
      steps?: Array<{ name?: string; env?: Record<string, string>; run?: string }>
    }
  >
}
const readWorkflow = (name: string): Workflow =>
  load(readFileSync(`.github/workflows/${name}.yml`, 'utf8')) as Workflow
const credentialed = readWorkflow('tests-backend-credentialed')
const job = credentialed.jobs['backend-credentialed-tests']!
const preflight = job.steps!.find(
  step => step.name === 'Check backend credentialed test credentials',
)!

describe('retained Lightpanda cloud CI boundary', () => {
  it('forwards the provisioned token through the trusted backend and nightly call chain', () => {
    const backend = readWorkflow('backend')
    const nightly = readWorkflow('nightly')
    expect(credentialed.on.workflow_call?.secrets?.LIGHTPANDA_TOKEN).toEqual({ required: false })
    expect(backend.on.workflow_call?.secrets?.LIGHTPANDA_TOKEN).toEqual({ required: false })
    const caller = backend.jobs['test-backend-credentialed']!
    expect(caller.if).toBe("needs.changes.outputs.trusted-secret-context == 'true'")
    expect(caller.secrets?.LIGHTPANDA_TOKEN).toBe(
      "${{ needs.changes.outputs.trusted-secret-context == 'true' && secrets.LIGHTPANDA_TOKEN || '' }}",
    )
    expect(nightly.jobs.backend?.secrets?.LIGHTPANDA_TOKEN).toBe('${{ secrets.LIGHTPANDA_TOKEN }}')
    expect(job.if).toBe('${{ inputs.trusted_secret_context }}')
    expect(preflight.env?.LIGHTPANDA_TOKEN).toBe('${{ secrets.LIGHTPANDA_TOKEN }}')
    const testStep = job.steps!.find(step => step.name === 'Run backend credentialed tests')!
    expect(testStep.env?.LIGHTPANDA_TOKEN).toBe('${{ secrets.LIGHTPANDA_TOKEN }}')
    expect(testStep.run?.match(/--project backend-lightpanda\b/g)).toHaveLength(1)
    expect(SECRET_INVENTORY.LIGHTPANDA_TOKEN.provisioned).toBe(true)
  })

  it.each([
    { name: 'missing', token: undefined, expected: 1, expectedOutput: null },
    { name: 'blank', token: ' \t\n ', expected: 1, expectedOutput: null },
    {
      name: 'present',
      token: 'private-preflight-sentinel',
      expected: 0,
      expectedOutput: 'has_aws=false\n',
    },
  ])(
    'executes the actual credential preflight for a $name token without leaking it',
    ({ token, expected, expectedOutput }) => {
      const directory = mkdtempSync(join(tmpdir(), 'lightpanda-preflight-'))
      onTestFinished(() => rmSync(directory, { recursive: true }))
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        LIGHTPANDA_TOKEN: token,
        AWS_TEST_ROLE_ARN: '',
        OPENAI_API_KEY: '',
        OPENROUTER_API_KEY: '',
        STRIPE_SECRET_KEY: '',
        GITHUB_OUTPUT: join(directory, 'outputs'),
      }
      if (token === undefined) delete env.LIGHTPANDA_TOKEN
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', preflight.run!], {
        env,
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 64 * 1024,
      })
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      expect(result.status).toBe(expected)
      expect(result.stdout).not.toContain('private-preflight-sentinel')
      expect(result.stderr).not.toContain('private-preflight-sentinel')
      expect(result.stdout.includes('::error::LIGHTPANDA_TOKEN is required')).toBe(expected === 1)
      expect(result.stdout.includes('::error::')).toBe(expected === 1)
      const output = existsSync(env.GITHUB_OUTPUT!)
        ? readFileSync(env.GITHUB_OUTPUT!, 'utf8')
        : null
      expect(output).toBe(expectedOutput)
    },
  )
})
