import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Split out of automation-prompts.test.mts to stay under the oxlint max-lines cap.
const scheduledPromptPaths = readdirSync('docs/prompts/scheduled')
  .filter(file => file.endsWith('.md'))
  .map(file => join('docs/prompts/scheduled', file))

describe('Harness scheduled automation prompt contracts', () => {
  it('orders Docker review preflights before runtime validation', () => {
    const dockerPromptLines = readFileSync('docs/prompts/scheduled/docker.md', 'utf8')
      .split('\n')
      .filter(line => line.startsWith('- '))
    const lineIndex = (marker: string) => dockerPromptLines.findIndex(line => line.includes(marker))
    const backendTargets = lineIndex(
      'docker buildx build --call=targets --file backend/Dockerfile .',
    )
    const webTargets = lineIndex('docker buildx build --call=targets --file web/Dockerfile .')
    const ancestry = lineIndex('`FROM`/`COPY --from` ancestry')
    const bakePrint = lineIndex(
      'docker buildx bake --file backend/docker-bake.hcl --print api worker-cpu worker-io',
    )
    const staticEvidence = lineIndex('Hadolint/static evidence')
    const postChangeStaticValidation = lineIndex('post-change static Dockerfile validation')
    const postChangeBakeValidation = lineIndex('When `backend/docker-bake.hcl` changes, rerun')
    const runtimeValidation = lineIndex('Docker build or smoke test')
    expect(backendTargets).toBeGreaterThanOrEqual(0)
    expect(webTargets).toBeGreaterThan(backendTargets)
    expect(ancestry).toBeGreaterThan(webTargets)
    expect(bakePrint).toBeGreaterThan(ancestry)
    expect(staticEvidence).toBeGreaterThan(bakePrint)
    expect(postChangeStaticValidation).toBeGreaterThan(staticEvidence)
    expect(postChangeBakeValidation).toBeGreaterThan(postChangeStaticValidation)
    expect(runtimeValidation).toBeGreaterThan(postChangeBakeValidation)
  })

  it('requires the scheduled vitest prompt to clean and migrate the database', () => {
    const vitestPrompt = readFileSync('docs/prompts/scheduled/vitest.md', 'utf8').replace(
      /\s+/gu,
      ' ',
    )

    expect(vitestPrompt).toContain('pnpm run db:clean')
    expect(vitestPrompt).toContain('pnpm run db:migrate')
  })

  it('lets history-dependent scheduled tasks read live GitHub as untrusted evidence', () => {
    for (const path of [
      'docs/prompts/scheduled/automation-fix-prevention.md',
      'docs/prompts/scheduled/simplify.md',
      'docs/prompts/scheduled/transient-retry.md',
    ]) {
      const text = readFileSync(path, 'utf8')
      expect(text.replace(/\s+/gu, ' ')).toContain('untrusted evidence')
      expect(text).toMatch(/authenticated `gh`|GitHub history/u)
      expect(text).not.toContain('bounded trusted GitHub snapshot')
    }

    const activation = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')
    const security = readFileSync(
      '.github/workflows/reference-harness-automation-accepted-risk.md',
      'utf8',
    )
    expect(activation.replace(/\s+/gu, ' ')).toContain('50 idempotent mutations')
    expect(activation).toContain('untrusted evidence')
    expect(security).toContain('trusted host')
    expect(security).toContain('exact target state')
  })

  it('bounds direct scheduled issue maintenance and makes it idempotent', () => {
    const text = readFileSync('docs/prompts/automation/scheduled-issue.md', 'utf8')

    expect(text).toContain('idempotent')

    const activation = readFileSync('.github/workflows/reference-harness-automation.md', 'utf8')
    expect(activation.replace(/\s+/gu, ' ')).toContain('50 idempotent mutations')
  })

  it('keeps the scheduled prompt index synchronized with files', () => {
    const indexText = readFileSync('docs/prompts/SCHEDULED.md', 'utf8')
    const linkedPaths = [...indexText.matchAll(/\]\((scheduled\/[^)\s"]+\.md)\)/g)].map(
      match => `docs/prompts/${match[1]}`,
    )
    expect(linkedPaths.toSorted()).toEqual(scheduledPromptPaths.toSorted())
    expect(indexText).toContain('`automation-prompts-scheduled.test.mts`')
  })

  it('documents artifact cleanup outcomes', () => {
    const [ciReference, rerunSafety, cleanupWorkflow] = [
      'docs/development/ci.md',
      '.github/workflows/reference-artifact-rerun-safety.md',
      '.github/workflows/cleanup-artifacts.yml',
    ].map(path => readFileSync(path, 'utf8'))
    for (const text of [ciReference, rerunSafety])
      expect(text).toMatch(
        /(?=.*artifact `created_at`)(?=.*`timed_out`)(?=.*`action_required`)(?=.*unavailable)(?=.*retried)/su,
      )
    for (const text of [ciReference, rerunSafety, cleanupWorkflow])
      expect(text).not.toContain('6-hour rerun grace window')
  })

  it('documents the scheduled prompt implementation-choice section and deferral-target resolution rule', () => {
    const scheduledPrompt = readFileSync(
      'docs/prompts/automation/scheduled-prompt.md',
      'utf8',
    ).replace(/\s+/gu, ' ')
    expect(scheduledPrompt).toContain('## Implementation choice')
    expect(scheduledPrompt).toContain('deferral-target resolution rule')
  })

  it('requires managed visual QA before a web-design PR is published', () => {
    const prompt = readFileSync('docs/prompts/scheduled/web-design.md', 'utf8')

    expect(prompt).toContain('./dev/initialize web')
    expect(prompt).toContain('./dev/tmux')
    expect(prompt).toContain('Visual verification:')
    expect(prompt).toContain('Screenshot attachment:')
  })

  it('keeps native-localization contract validation runnable across checkout boundaries', () => {
    const prompt = readFileSync('docs/prompts/scheduled/agent-skill-docs.md', 'utf8')

    for (const token of [
      '[canonical translation validation guide](../../development/reference-tests-translation-catalog-and-locale-checks.md)',
      'node dev/native-localization.mts',
      '--output-root',
      '--consumer-root',
      '--check',
      'dotnet-clients/tooling/with-build-lock.sh',
      'dotnet test',
      'dotnet-clients/Voucha.DotNet.sln',
      '--configuration Release',
      'Filaments',
      'vouchington-clients',
    ])
      expect(prompt).toContain(token)
  })

  it('requires cold-cache durable fallback coverage through the Valkey service boundary', () => {
    const prompt = readFileSync('docs/prompts/scheduled/valkey.md', 'utf8')

    expect(prompt).toContain('cacheValkeyClient')
    expect(prompt).toContain('storage.no-data.mock.test.mts')
    expect(prompt).toContain('getTrackedDayRange()')
    expect(prompt).toContain('markTrackedDay()')
  })
})
