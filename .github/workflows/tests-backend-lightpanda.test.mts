import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it, onTestFinished } from 'vitest'

type Workflow = {
  jobs: Record<
    string,
    {
      steps?: Array<{ name?: string; run?: string }>
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
  it.each([
    { name: 'missing', token: undefined, missing: true },
    { name: 'blank', token: ' \t\n ', missing: true },
    {
      name: 'present',
      token: 'private-preflight-sentinel',
      missing: false,
    },
  ])(
    'executes the actual credential preflight for a $name token without leaking it',
    ({ token, missing }) => {
      const directory = mkdtempSync(join(tmpdir(), 'lightpanda-preflight-'))
      onTestFinished(() => rmSync(directory, { recursive: true }))
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        LIGHTPANDA_TOKEN: token,
        AWS_TEST_ROLE_ARN: 'arn:aws:iam::123456789012:role/preflight-fixture',
        OPENAI_API_KEY: '',
        OPENROUTER_API_KEY: '',
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
      expect(result.status).toBe(0)
      expect(result.stdout).not.toContain('private-preflight-sentinel')
      expect(result.stderr).not.toContain('private-preflight-sentinel')
      expect(result.stdout.includes('::warning::LIGHTPANDA_TOKEN is missing')).toBe(missing)
      expect(result.stdout).not.toContain('::error::')
      const output = existsSync(env.GITHUB_OUTPUT!)
        ? readFileSync(env.GITHUB_OUTPUT!, 'utf8')
        : null
      expect(output).toBe('has_aws=true\n')
    },
  )
})
