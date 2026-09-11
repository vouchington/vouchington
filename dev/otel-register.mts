// Preload shim for `node --import` so the OpenTelemetry auto-instrumentation
// dependency is a real, knip-traceable import instead of a shell string.
import '@opentelemetry/auto-instrumentations-node/register'
