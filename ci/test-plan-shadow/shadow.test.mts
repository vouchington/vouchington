import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { parseJunit, testFilePath } from './junit.mts'
import { main, settings } from './main.mts'
import { measure } from './measure.mts'
import { renderSummary } from './report.mts'

const vitestXml = `<testsuites>
<testsuite name="backend/a.test.mts" tests="2">
<testcase classname="backend/a.test.mts" name="one &amp; two" time="1.5"></testcase>
<testcase classname="backend/a.test.mts" name="two" time="0.5"><failure message="boom"/></testcase>
</testsuite>
<testsuite name="backend/b.test.mts"><testcase name="skipped" time="2"/></testsuite>
</testsuites>`

const playwrightXml = `<testsuites><testsuite name="x.spec.mts">
<testcase classname="[chromium] › playwright/tests/x.spec.mts:3:5 › title" name="t" time="4"><error/></testcase>
<testcase file="./playwright/tests/y.spec.mts" name="t" time="1"/>
</testsuite></testsuites>`

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'test-plan-shadow-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  onTestFinished(() => {
    vi.restoreAllMocks()
  })
  return root
}

describe('parseJunit', () => {
  it('sums durations per file and flags failures', () => {
    expect(parseJunit(vitestXml)).toEqual([
      { file: 'backend/a.test.mts', seconds: 2, failed: true },
      { file: 'backend/b.test.mts', seconds: 2, failed: false },
    ])
  })

  it('reads Playwright labels and file attributes', () => {
    expect(parseJunit(playwrightXml).map(({ file, failed }) => [file, failed])).toEqual([
      ['playwright/tests/x.spec.mts', true],
      ['playwright/tests/y.spec.mts', false],
    ])
  })

  it('decodes entities and tolerates unnamed suites', () => {
    const xml = '<testsuite><testcase name="x" file="a&lt;b&gt;&quot;&apos;.test.mts"/></testsuite>'
    expect(parseJunit(xml).map(entry => entry.file)).toEqual([`a<b>"'.test.mts`])
    expect(parseJunit('<testsuite><testcase name="x"/></testsuite>')).toEqual([])
  })

  it('ignores cases with no resolvable file and untimed cases', () => {
    expect(parseJunit('<testcase name="orphan" time="3"/>')).toEqual([])
    expect(parseJunit('<testcase classname="a.test.mts"/>')).toEqual([
      { file: 'a.test.mts', seconds: 0, failed: false },
    ])
    expect(testFilePath('a.test.mts')).toBe('a.test.mts')
  })
})

describe('measure', () => {
  const files = parseJunit(vitestXml)

  it('counts unplanned files as saved time and failing ones as misses', () => {
    const result = measure({ selected_tests: ['backend/b.test.mts'] }, files)
    expect(result).toMatchObject({
      totalFiles: 2,
      plannedFiles: 1,
      unplannedFiles: 1,
      savedSeconds: 2,
      totalSeconds: 4,
      misses: ['backend/a.test.mts'],
      fallback: false,
    })
  })

  it('matches by path suffix in either direction', () => {
    const result = measure({ selected_tests: ['repo/backend/a.test.mts'] }, files)
    expect(result.misses).toEqual([])
    expect(measure({ selected_tests: [{ test_file: 'a.test.mts' }] }, files).plannedFiles).toBe(1)
  })

  it('plans everything on a full-suite fallback and nothing without a plan', () => {
    expect(measure({ fallback_triggered: true }, files)).toMatchObject({
      plannedFiles: 2,
      savedSeconds: 0,
      misses: [],
      fallback: true,
    })
    expect(measure(undefined, files).misses).toEqual(['backend/a.test.mts'])
  })
})

describe('renderSummary and main', () => {
  it('renders misses, fallbacks and plan errors', () => {
    const text = renderSummary({
      run: { id: '1', workflow: 'Backend', headSha: 'abcdef0123456789', base: 'main' },
      frameworks: {
        vitest: measure({ selected_tests: [] }, parseJunit(vitestXml)),
        playwright: { error: 'no plan' },
        web: measure({ fallback_triggered: true }, parseJunit(vitestXml)),
      },
    })
    expect(text).toContain('| vitest | 0 / 2 | 0.1 of 0.1 | 1 |')
    expect(text).toContain('plan failed: no plan')
    expect(text).toContain('(full-suite fallback)')
    expect(text).toContain('- `backend/a.test.mts`')
  })

  it('writes the report from downloaded artifacts and tolerates a missing plan', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'junit/backend-junit-shard-1'), { recursive: true })
    mkdirSync(join(root, 'junit/backend-junit-shard-2'), { recursive: true })
    mkdirSync(join(root, 'junit/playwright-junit-shard-1'), { recursive: true })
    writeFileSync(join(root, 'junit/backend-junit-shard-2/test-report.junit.xml'), vitestXml)
    writeFileSync(join(root, 'junit/backend-junit-shard-1/test-report.junit.xml'), vitestXml)
    writeFileSync(join(root, 'junit/playwright-junit-shard-1/test-report.junit.xml'), playwrightXml)
    writeFileSync(
      join(root, 'vitest.json'),
      JSON.stringify({ selected_tests: ['backend/a.test.mts'] }),
    )
    main(
      settings({
        JUNIT_DIR: join(root, 'junit'),
        VITEST_PLAN: join(root, 'vitest.json'),
        PLAYWRIGHT_PLAN: join(root, 'missing.json'),
        OUT_DIR: join(root, 'out'),
        GITHUB_STEP_SUMMARY: join(root, 'summary.md'),
        SOURCE_RUN_ID: '7',
        SOURCE_WORKFLOW: 'Backend',
        HEAD_SHA: 'abc',
        BASE_REF: 'main',
      }),
    )
    const report = JSON.parse(readFileSync(join(root, 'out/test-plan-shadow.json'), 'utf8'))
    expect(report.frameworks.vitest.misses).toEqual([])
    expect(report.frameworks.playwright.error).toBeTruthy()
    expect(readFileSync(join(root, 'summary.md'), 'utf8')).toContain('Test plan shadow')
  })

  it('skips a framework whose area uploaded no reports', () => {
    const root = tempRoot()
    mkdirSync(join(root, 'junit/tooling-junit'), { recursive: true })
    writeFileSync(join(root, 'junit/tooling-junit/report.xml'), vitestXml)
    main(settings({ JUNIT_DIR: join(root, 'junit'), OUT_DIR: join(root, 'out') }))
    const report = JSON.parse(readFileSync(join(root, 'out/test-plan-shadow.json'), 'utf8'))
    expect(Object.keys(report.frameworks)).toEqual(['vitest'])
    expect(report.frameworks.vitest.error).toBeTruthy()
  })

  it('records an unreadable download directory as an error instead of throwing', () => {
    const root = tempRoot()
    main(settings({ JUNIT_DIR: join(root, 'absent'), OUT_DIR: join(root, 'out') }))
    const report = JSON.parse(readFileSync(join(root, 'out/test-plan-shadow.json'), 'utf8'))
    expect(report.frameworks.report.error).toBeTruthy()
    expect(report.run).toEqual({ id: '', workflow: '', headSha: '', base: '' })
  })
})
