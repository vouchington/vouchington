import { describe, expect, it } from 'vitest'
import { createOtelSpanProcessors } from './sentry-otel'

const exporterOptions: Array<{ url?: string }> = []

class MockOTLPTraceExporter {
  url?: string

  constructor(options: { url?: string }) {
    exporterOptions.push(options)
    this.url = options.url
  }
}

class MockBatchSpanProcessor {
  exporter: unknown

  constructor(exporter: unknown) {
    this.exporter = exporter
  }
}

const testDeps = {
  BatchSpanProcessor: MockBatchSpanProcessor,
  OTLPTraceExporter: MockOTLPTraceExporter,
} as unknown as NonNullable<Parameters<typeof createOtelSpanProcessors>[1]>

function makeEnv(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return { NODE_ENV: 'test', ...overrides }
}

describe('createOtelSpanProcessors', () => {
  it('does not create processors when OTel is disabled', () => {
    expect(createOtelSpanProcessors(makeEnv({ OTEL_ENABLED: '0' }), testDeps)).toBeUndefined()
  })

  it('uses the explicit traces endpoint when present', () => {
    const processors = createOtelSpanProcessors(
      makeEnv({
        OTEL_ENABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/',
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/custom-traces',
      }),
      testDeps,
    )

    expect(processors).toEqual([{ exporter: { url: 'http://collector:4318/custom-traces' } }])
    expect(exporterOptions.at(-1)).toEqual({ url: 'http://collector:4318/custom-traces' })
  })

  it('derives the traces endpoint from the base OTLP endpoint', () => {
    const processors = createOtelSpanProcessors(
      makeEnv({
        OTEL_ENABLED: '1',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/',
      }),
      testDeps,
    )

    expect(processors).toEqual([{ exporter: { url: 'http://collector:4318/v1/traces' } }])
    expect(exporterOptions.at(-1)).toEqual({ url: 'http://collector:4318/v1/traces' })
  })
})
