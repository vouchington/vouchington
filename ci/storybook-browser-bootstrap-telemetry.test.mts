import { describe, expect, it } from 'vitest'

import { StorybookBrowserBootstrapTelemetry } from './storybook-browser-bootstrap-telemetry.mts'

describe('Storybook browser bootstrap telemetry', () => {
  it('records honest ordered milestones across ANSI and chunk-split output', () => {
    const telemetry = new StorybookBrowserBootstrapTelemetry()

    telemetry.consume('stderr', '\u001B[35m2026-07-29 vitest:browser:play', 10)
    telemetry.consume('stderr', 'wright initializing the browser chromium\u001B[0m\n', 20)
    telemetry.consume('stderr', '2026-07-29 vitest:browser:playwright the context is ready\n', 30)
    telemetry.consume('stderr', '2026-07-29 vitest:browser:playwright the page is ready\n', 40)
    telemetry.consume(
      'stderr',
      '2026-07-29 vitest:browser:playwright browser page is created, opening http://localhost:49123/\n',
      50,
    )
    telemetry.consume(
      'stderr',
      '2026-07-29 vitest:browser:api Browser API connected to orchestrator\n',
      60,
    )
    telemetry.consume(
      'stderr',
      '[PW Error] request failed: GET http://localhost:49123/story.ts',
      70,
    )
    telemetry.flush('stderr', 80)

    expect(telemetry.snapshot()).toEqual({
      orchestratorDisconnectCount: 0,
      requestFailureCount: 1,
      requestFailureSamples: ['[PW Error] request failed: GET http://localhost:49123/story.ts'],
      terminalStage: 'handshake-after-websocket',
      timeline: [
        { atMs: 20, milestone: 'provider-started' },
        { atMs: 30, milestone: 'context-ready' },
        { atMs: 40, milestone: 'page-ready' },
        { atMs: 50, milestone: 'navigation-requested' },
        { atMs: 60, milestone: 'orchestrator-connected' },
      ],
    })
  })

  it('treats bootstrap diagnostics as non-progress output', () => {
    const telemetry = new StorybookBrowserBootstrapTelemetry()

    for (const line of [
      '2026-07-29 vitest:browser:playwright initializing the browser chromium\n',
      '2026-07-29 vitest:browser:api Browser API connected to orchestrator\n',
      '[PW Error] request failed: GET http://localhost:49123/story.ts\n',
      '2026-07-29 pw:browser <launched> pid=123\n',
      '2026-07-29 pw:protocol ◀ RECV heartbeat\n',
    ]) {
      expect(telemetry.consume('stderr', line, 10).hasNonDiagnosticOutput).toBe(false)
    }
    expect(
      telemetry.consume('stdout', 'VITE v8.1.5 ready in 500 ms\n', 20).hasNonDiagnosticOutput,
    ).toBe(true)
  })

  it('filters and caps verbose dependency diagnostics', () => {
    const telemetry = new StorybookBrowserBootstrapTelemetry()

    expect(
      telemetry.consume('stderr', '2026-07-29 vitest:browser:api Triggering command getFiles\n', 10)
        .output,
    ).toBe('')
    expect(
      telemetry.consume(
        'stderr',
        '2026-07-29 vitest:browser:api Browser API connected to orchestrator\n',
        20,
      ).output,
    ).toContain('Browser API connected to orchestrator')
    expect(
      telemetry.consume(
        'stderr',
        '2026-07-29 vitest:browser:api Browser API disconnected from orchestrator\n',
        21,
      ).output,
    ).toContain('Browser API disconnected from orchestrator')
    expect(telemetry.snapshot().orchestratorDisconnectCount).toBe(1)

    let requestOutput = ''
    for (let index = 0; index < 25; index += 1) {
      requestOutput += telemetry.consume(
        'stderr',
        `[PW Error] request failed: GET http://localhost:49123/${index}\n`,
        30 + index,
      ).output
    }
    expect(requestOutput.match(/\[PW Error]/g)).toHaveLength(20)
    expect(requestOutput).toContain('suppressed additional request-failure diagnostic lines')

    let browserOutput = ''
    for (let index = 0; index < 205; index += 1) {
      browserOutput += telemetry.consume(
        'stderr',
        `2026-07-29 pw:browser lifecycle event ${index}\n`,
        100 + index,
      ).output
    }
    expect(browserOutput.match(/pw:browser lifecycle event/g)).toHaveLength(200)
    expect(browserOutput).toContain('suppressed additional pw:browser lines')
  })

  it('bounds newline-free output while retaining its diagnostic prefix and tail', () => {
    const telemetry = new StorybookBrowserBootstrapTelemetry()

    telemetry.consume('stderr', `2026-07-29 pw:protocol ${'x'.repeat(1024 * 1024)}`, 10)
    telemetry.consume('stderr', `${'y'.repeat(1024 * 1024)}diagnostic-tail`, 15)
    const flushed = telemetry.flush('stderr', 20)

    expect(flushed.output).toBe('')
  })

  it('reports the furthest proven stage when output arrives out of lifecycle order', () => {
    const telemetry = new StorybookBrowserBootstrapTelemetry()

    telemetry.recordSemanticProgress(10)
    telemetry.consume(
      'stderr',
      '2026-07-29 vitest:browser:playwright initializing the browser chromium\n',
      20,
    )

    expect(telemetry.snapshot().terminalStage).toBe('semantic-progress')
    expect(telemetry.snapshot().timeline).toEqual([
      { atMs: 10, milestone: 'semantic-progress' },
      { atMs: 20, milestone: 'provider-started' },
    ])
  })
})
