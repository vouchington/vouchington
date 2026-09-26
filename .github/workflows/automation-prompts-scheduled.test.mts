import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const scheduledPromptPaths = readdirSync('docs/prompts/scheduled')
  .filter(file => file.endsWith('.md'))
  .map(file => join('docs/prompts/scheduled', file))

describe('Harness scheduled automation prompt contracts', () => {
  it('orders the Docker review preflights before post-change bake validation', () => {
    const dockerPromptLines = readFileSync('docs/prompts/scheduled/docker.md', 'utf8')
      .split('\n')
      .filter(line => line.startsWith('- '))
    const lineIndex = (marker: string) => dockerPromptLines.findIndex(line => line.includes(marker))
    const backendTargets = lineIndex(
      'docker buildx build --call=targets --file backend/Dockerfile .',
    )
    const webTargets = lineIndex('docker buildx build --call=targets --file web/Dockerfile .')
    const ancestry = lineIndex('`FROM`/`COPY --from`')
    const bakePrint = lineIndex(
      'docker buildx bake --file backend/docker-bake.hcl --print api worker-cpu worker-io',
    )
    const staticEvidence = lineIndex('`.hadolint.yaml`')
    const postChangeBakeValidation = lineIndex('`backend/docker-bake.hcl`')
    expect(backendTargets).toBeGreaterThanOrEqual(0)
    expect(webTargets).toBeGreaterThan(backendTargets)
    expect(ancestry).toBeGreaterThan(webTargets)
    expect(bakePrint).toBeGreaterThan(ancestry)
    expect(staticEvidence).toBeGreaterThan(bakePrint)
    expect(postChangeBakeValidation).toBeGreaterThan(staticEvidence)
  })

  it('requires the scheduled vitest prompt to clean and migrate the database', () => {
    const vitestPrompt = readFileSync('docs/prompts/scheduled/vitest.md', 'utf8').replace(
      /\s+/gu,
      ' ',
    )

    expect(vitestPrompt).toContain('pnpm run db:clean')
    expect(vitestPrompt).toContain('pnpm run db:migrate')
  })

  it('keeps the scheduled prompt index synchronized with files', () => {
    const indexText = readFileSync('docs/prompts/SCHEDULED.md', 'utf8')
    const linkedPaths = [...indexText.matchAll(/\]\((scheduled\/[^)\s"]+\.md)\)/g)].map(
      match => `docs/prompts/${match[1]}`,
    )
    expect(linkedPaths.toSorted()).toEqual(scheduledPromptPaths.toSorted())
    expect(indexText).toContain('`automation-prompts-scheduled.test.mts`')
  })

  it('starts the managed web stack for web-design visual QA', () => {
    const prompt = readFileSync('docs/prompts/scheduled/web-design.md', 'utf8')

    expect(prompt).toContain('./dev/initialize web')
    expect(prompt).toContain('./dev/tmux')
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
      'Vouchington',
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
