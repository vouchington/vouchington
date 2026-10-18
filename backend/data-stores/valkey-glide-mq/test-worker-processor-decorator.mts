export type TestWorkerProcessorDecorator = (processor: unknown, queueName: string) => unknown

// Setup files are not re-run by vi.resetModules(), but app factory modules are. Share the
// test-only decorator across those module instances so later workers retain query profiling.
const DECORATOR_KEY = Symbol.for('voucha.testWorkerProcessorDecorator')
const decoratorGlobal = globalThis as typeof globalThis & {
  [DECORATOR_KEY]?: TestWorkerProcessorDecorator
}

/** @public Installs Voucha's query profiler from test-helpers/vitest.setup.worker-query-profiles.mts;
 * production export analysis excludes that supported test setup consumer. */
export function setTestWorkerProcessorDecorator(
  decorator: TestWorkerProcessorDecorator | undefined,
): void {
  decoratorGlobal[DECORATOR_KEY] = decorator
}

export function getTestWorkerProcessorDecorator(): TestWorkerProcessorDecorator | undefined {
  return decoratorGlobal[DECORATOR_KEY]
}
