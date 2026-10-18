export type TestWorkerProcessorDecorator = (processor: unknown, queueName: string) => unknown

let testWorkerProcessorDecorator: TestWorkerProcessorDecorator | undefined

/** @public Installs Voucha's query profiler from test-helpers/vitest.setup.worker-query-profiles.mts;
 * production export analysis excludes that supported test setup consumer. */
export function setTestWorkerProcessorDecorator(decorator: TestWorkerProcessorDecorator): void {
  testWorkerProcessorDecorator = decorator
}

export function getTestWorkerProcessorDecorator(): TestWorkerProcessorDecorator | undefined {
  return testWorkerProcessorDecorator
}
