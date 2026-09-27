import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Guards the Claude OS-sandbox credential deny list against doc drift.
// Rationale: docs/development/reference-agent-sandbox-credential-deny-list.md
const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const CREDENTIAL_DENY_MARKER = '<!-- sandbox-credentials-env-vars -->'

type SandboxCredentialEnvVar = {
  mode: string
  name: string
}

const claudeSettings = JSON.parse(repoFile('.claude/settings.json')) as {
  sandbox: { credentials: { envVars: SandboxCredentialEnvVar[] } }
}

function documentedCredentialNames(markdown: string): string[] {
  const start = markdown.indexOf(CREDENTIAL_DENY_MARKER)
  if (start < 0) return []
  const rest = markdown.slice(start + CREDENTIAL_DENY_MARKER.length)
  const nextHeading = rest.search(/^## /m)
  const section = nextHeading < 0 ? rest : rest.slice(0, nextHeading)
  return [...section.matchAll(/^\| `([A-Z][A-Z0-9_]+)`\s+\|/gm)].map(match => match[1])
}

describe('Claude sandbox credential deny list', () => {
  it('reads credential names only from the marked table', () => {
    const sample = [
      '`GITHUB_PERSONAL_ACCESS_TOKEN`',
      CREDENTIAL_DENY_MARKER,
      '| `AGENT_BLACKBOARD_TOKEN` | client |',
      '## Next',
      '| `SONAR_TOKEN` | later |',
    ].join('\n')

    expect(documentedCredentialNames(sample)).toEqual(['AGENT_BLACKBOARD_TOKEN'])
  })

  it('keeps the documented deny names equal to sandbox.credentials.envVars', () => {
    const configured = claudeSettings.sandbox.credentials.envVars
    const inventoryDoc = repoFile(
      'docs/development/reference-agent-sandbox-credential-deny-list.md',
    )

    expect(documentedCredentialNames(inventoryDoc)).toEqual(configured.map(entry => entry.name))
    expect(configured.length).toBeGreaterThan(0)
    expect(configured.map(entry => entry.mode)).toEqual(configured.map(() => 'deny'))
  })

  it('names the credential deny list from the sandbox doc', () => {
    const sandboxDoc = repoFile('docs/development/agent-sandbox.md')

    expect(sandboxDoc).toContain('sandbox.credentials.envVars')
    expect(sandboxDoc).toContain('dev/agent-sandbox-credentials.test.mts')
    expect(sandboxDoc).toContain('reference-agent-sandbox-credential-deny-list.md')
    expect(sandboxDoc).not.toContain(CREDENTIAL_DENY_MARKER)
  })

  it('points the blackboard stop-work gate at the sandbox credential deny list', () => {
    expect(repoFile('docs/development/agent-blackboard.md')).toContain(
      'agent-sandbox.md#sandbox-credential-deny-list',
    )
  })
})
