import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const recipe = readFileSync(
  new URL('../.agents/skills/agent-workflow/impact-recipes.md', import.meta.url),
  'utf8',
)
  .replace(/\s+/g, ' ')
  .trim()
const beforePushing = readFileSync(
  new URL('../.agents/skills/agent-workflow/before-pushing.md', import.meta.url),
  'utf8',
)
const planningDiscovery = readFileSync(
  new URL('../.agents/skills/planning/references/impact-discovery.md', import.meta.url),
  'utf8',
)
const securityRoot = readFileSync(
  new URL('../docs/requirements/security/SECURITY.md', import.meta.url),
  'utf8',
)
const endpointContextDocs = [
  readFileSync(new URL('../docs/overview/infrastructure/deployment.md', import.meta.url), 'utf8'),
  readFileSync(new URL('../docs/overview/infrastructure/networking.md', import.meta.url), 'utf8'),
  readFileSync(
    new URL('../docs/requirements/security/reference-security-honeypot-fields.md', import.meta.url),
    'utf8',
  ),
]

describe('agent workflow boundary recipes documentation', () => {
  it('documents endpoint migration discovery and deployment evidence', () => {
    expect(recipe).toContain('## Endpoint Migration')
    expect(recipe).toContain("git grep -n -F '<old-url-or-host>'")
    expect(recipe).toContain("git -C '<vouchington-infra-checkout>' grep -n -F '<old-url-or-host>'")
    expect(recipe).toContain('deployment.md#deploy-decoupling--independent-safety')
  })

  it('requires a redacted directory gitleaks scan for endpoint-shaped changes', () => {
    expect(recipe).toContain(
      'pnpm exec vouchington gitleaks-directory-scan --config .gitleaks.toml',
    )
    expect(recipe).toContain('`gitleaks git`')
  })

  it('routes planning and before-push discovery through the endpoint recipe', () => {
    expect(beforePushing).toContain('[Endpoint Migration](impact-recipes.md#endpoint-migration)')
    expect(planningDiscovery).toContain(
      '[Endpoint Migration](../../agent-workflow/impact-recipes.md#endpoint-migration)',
    )
    expect(securityRoot).toContain(
      '[Honeypot Fields, Input Sanitization, Link Attributes, Images, Scraping Protection, Production Checklist, and Related](reference-security-honeypot-fields.md)',
    )
    for (const contextDoc of endpointContextDocs) {
      expect(contextDoc).toContain(
        '.agents/skills/agent-workflow/impact-recipes.md#endpoint-migration',
      )
    }
  })
})
