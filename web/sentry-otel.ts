import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base'

interface OtelSpanProcessorDeps {
  BatchSpanProcessor: new (exporter: unknown) => SpanProcessor
  OTLPTraceExporter: new (options: { url?: string }) => unknown
}

const defaultDeps: OtelSpanProcessorDeps = {
  BatchSpanProcessor: BatchSpanProcessor as unknown as OtelSpanProcessorDeps['BatchSpanProcessor'],
  OTLPTraceExporter,
}

export function createOtelSpanProcessors(
  env: NodeJS.ProcessEnv = process.env,
  deps: OtelSpanProcessorDeps = defaultDeps,
): SpanProcessor[] | undefined {
  if (env.OTEL_ENABLED !== '1') return undefined

  return [
    new deps.BatchSpanProcessor(new deps.OTLPTraceExporter({ url: resolveOtlpTraceUrl(env) })),
  ]
}

function resolveOtlpTraceUrl(env: NodeJS.ProcessEnv): string | undefined {
  const tracesEndpoint = getNonEmptyEnv(env, 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT')
  if (tracesEndpoint) return tracesEndpoint

  const endpoint = getNonEmptyEnv(env, 'OTEL_EXPORTER_OTLP_ENDPOINT')
  return endpoint ? `${endpoint.replace(/\/+$/, '')}/v1/traces` : undefined
}

function getNonEmptyEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim()
  return value ? value : undefined
}
