import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = (name: string) => readFileSync(`.github/workflows/${name}`, 'utf8')

type Workflow = {
  jobs?: Record<
    string,
    {
      steps?: Array<{
        id?: string
        run?: string
        with?: { filters?: string }
      }>
    }
  >
}

function runtimeConsumers(command: string): Array<{ file: string; run: string }> {
  return readdirSync('.github/workflows')
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
    .flatMap(file => {
      const parsed = load(workflow(file)) as Workflow
      return Object.values(parsed.jobs ?? {}).flatMap(job =>
        (job.steps ?? [])
          .filter(step => step.run?.includes(command) === true)
          .map(step => ({ file, run: step.run! })),
      )
    })
    .toSorted((left, right) => left.file.localeCompare(right.file))
}

describe('host-global memory-heavy slot coverage', () => {
  it('reserves the heavy slot exclusively for type-aware oxlint', () => {
    expect(runtimeConsumers('with-heavy-slot.sh')).toEqual([
      {
        file: 'static-code-analysis.yml',
        run: 'bash ci/with-heavy-slot.sh pnpm exec oxlint --type-aware --deny-warnings',
      },
    ])
  })

  it('keeps the oxlint workflow job timeout allowlisted without the route-selector check', () => {
    const config = load(readFileSync('.no-mistakes.yml', 'utf8')) as {
      rules?: Array<{
        rule?: string
        options?: { allow?: Array<{ job?: string; maxMinutes?: number }> }
      }>
    }
    const timeouts = config.rules?.find(rule => rule.rule === 'github-actions-job-timeouts')
    expect(
      timeouts?.options?.allow?.find(
        entry => entry.job === '.github/workflows/static-code-analysis.yml#static-code-analysis',
      ),
    ).toEqual({
      job: '.github/workflows/static-code-analysis.yml#static-code-analysis',
      maxMinutes: 50,
    })
    expect(
      timeouts?.options?.allow?.find(
        entry => entry.job === '.github/workflows/static-code-analysis.yml#no-mistakes-owned',
      ),
    ).toEqual({
      job: '.github/workflows/static-code-analysis.yml#no-mistakes-owned',
      maxMinutes: 55,
    })
  })

  it('keeps the canonical heavy pool at one shared one-slot capacity', () => {
    const heavyWrapper = readFileSync('ci/with-heavy-slot.sh', 'utf8')

    expect(heavyWrapper).toContain('--slots 1')
    expect(heavyWrapper).not.toContain('VOUCHA_HEAVY_SLOT_COUNT')
  })

  it('forbids wrapper composition and generic nested lock re-entry', () => {
    const buildWrapper = readFileSync('ci/with-build-lock.sh', 'utf8')
    const heavyWrapper = readFileSync('ci/with-heavy-slot.sh', 'utf8')
    const hostWrapper = readFileSync('ci/with-host-lock.sh', 'utf8')

    expect(buildWrapper).toContain('--name expensive-build')
    expect(buildWrapper).not.toContain('with-heavy-slot.sh')
    expect(heavyWrapper).not.toContain('with-build-lock.sh')
    expect(hostWrapper).toContain('VOUCHA_HOST_LOCK_ACTIVE')
    expect(hostWrapper).not.toContain('VOUCHA_HOST_LOCK_HELD_TOKENS')
  })

  it('does not route non-static workflow filters through the oxlint-only wrapper', () => {
    const filters = load(readFileSync('.github/ci-path-filters.yml', 'utf8')) as Record<
      string,
      string[]
    >

    expect(
      Object.entries(filters)
        .filter(([, paths]) => paths.includes('ci/with-heavy-slot.sh'))
        .map(([name]) => name),
    ).toEqual([])
  })

  it.each(['main-backend.yml', 'main-web.yml', 'main-storybook.yml'])(
    '%s does not subscribe to the oxlint-only wrapper',
    file => {
      expect(workflow(file)).not.toContain("'ci/with-heavy-slot.sh'")
    },
  )

  it('keeps one build-lock owner on the web setup path', () => {
    const action = readFileSync('.github/actions/build-web-targets/action.yml', 'utf8')
    const webManifest = JSON.parse(readFileSync('web/package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(action).toContain('node ci/setup-web-integration.mts')
    expect(action).not.toContain('with-build-lock.sh')
    expect(webManifest.scripts.build).toContain('with-build-lock.sh')
    expect(webManifest.scripts.build).toContain('VOUCHA_BUILD_LOCK_ON_ACQUIRE_TIMEOUT=fail')
    expect(webManifest.scripts.build).toContain('VOUCHA_BUILD_LOCK_WAIT_SECONDS=300')
  })
})
