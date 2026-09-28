import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-playwright.yml', 'utf8')
const playwrightSharedConfig = readFileSync('playwright/config/shared-config.mts', 'utf8')
const playwrightServerCommand = readFileSync('playwright/config/web-server-command.mts', 'utf8')

function workflowJobSection(body: string, jobName: string): string {
  const match = body.match(
    new RegExp(`\\n {2}${jobName}:[\\s\\S]*?(?=\\n {2}[a-zA-Z0-9_-]+:\\n|$)`),
  )
  expect(match).not.toBeNull()
  return match![0]
}

describe('tests-playwright.yml OTel collector', () => {
  it('supports opt-in manual OTel observability without expanding PR or main behavior', () => {
    const webWorkflow = readFileSync('.github/workflows/web.yml', 'utf8')
    const pathFilters = readFileSync('.github/ci-path-filters.yml', 'utf8')
    const mainWebWorkflow = readFileSync('.github/workflows/main-web.yml', 'utf8')
    const allocatePorts = workflow.indexOf('- name: Allocate ports')
    const startOtelCollector = workflow.indexOf('- name: Start OTel collector')
    const runPlaywright = workflow.indexOf('- name: Run Playwright tests')

    expect(workflow).toContain('otel_enabled:')
    expect(workflow).toContain("OTEL_ENABLED: ${{ inputs.otel_enabled && '1' || '' }}")
    expect(workflow).toContain('NEXT_PUBLIC_GIT_COMMIT: ${{ github.sha }}')
    expect(workflow).toContain('name: Start OTel collector')
    expect(startOtelCollector).toBeGreaterThan(allocatePorts)
    expect(startOtelCollector).toBeLessThan(runPlaywright)
    expect(workflow.slice(allocatePorts, startOtelCollector)).not.toMatch(/\n {6}- (?:name|uses):/)
    expect(workflow).toContain('echo "Starting OTel collector"')
    expect(workflow).toMatch(/otel\/opentelemetry-collector-contrib:\d+\.\d+\.\d+/u)
    expect(workflow).toContain('dev/otel/collector-config-ci.yaml')
    expect(workflow).toContain('chmod 0777 "$RUNNER_TEMP/otel-output"')
    expect(workflow).toContain('-p "127.0.0.1:$OTEL_HTTP_PORT:4318"')
    expect(workflow).toContain('-p "127.0.0.1:$OTEL_GRPC_PORT:4317"')
    expect(workflow).not.toContain('docker port "$COLLECTOR_NAME"')
    expect(workflow).not.toContain('port is already allocated')
    expect(workflow).not.toContain('OTel collector port collided')
    expect(workflow).not.toContain('Failed to allocate non-colliding OTel collector ports')
    expect(workflow).toContain('OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:$OTEL_HTTP_PORT')
    expect(workflow).toContain('docker stop --time 10')
    expect(workflow).toContain('playwright-otel-output-shard-${{ matrix.shard }}')
    expect(playwrightSharedConfig).toContain(`OTEL_SERVICE_NAME: 'voucha-web'`)
    expect(playwrightSharedConfig).toContain(
      'NODE_OPTIONS: withOtelNodeOptions(nodeOptions, otelEnabled),',
    )
    expect(playwrightSharedConfig).not.toContain('sentry-preload')
    expect(playwrightServerCommand).toContain(
      "const otelRegisterPreload = join(repoRoot, 'dev', 'otel-register.mts')",
    )
    expect(workflow).not.toContain('aws-actions/configure-aws-credentials')
    expect(workflow).not.toContain('id-token: write')
    // Area and main CI leave the opt-in off; workflow_dispatch owns one-off diagnostics.
    expect(workflowJobSection(webWorkflow, 'test-playwright')).not.toContain('otel_enabled:')
    expect(mainWebWorkflow).not.toContain('otel_enabled:')
    expect(mainWebWorkflow).not.toContain('store-playwright-otel')
    expect(workflow).toContain('workflow_dispatch:')
    expect(webWorkflow).not.toContain('test-playwright-otel:')
    expect(pathFilters).toContain("'playwright/config/**'")
    expect(pathFilters).toContain('playwright/config/**')
    expect(pathFilters).toContain('ts-shared/utils/**')
    expect(webWorkflow).not.toContain('uses: ./.github/workflows/tests-playwright-otel.yml')
  })
})
