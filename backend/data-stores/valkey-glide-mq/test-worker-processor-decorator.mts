export type TestWorkerProcessorDecorator = (processor: unknown, queueName: string) => unknown

let testWorkerProcessorDecorator: TestWorkerProcessorDecorator | undefined

export function setTestWorkerProcessorDecorator(decorator: TestWorkerProcessorDecorator): void {
  testWorkerProcessorDecorator = decorator
}

export function getTestWorkerProcessorDecorator(): TestWorkerProcessorDecorator | undefined {
  return testWorkerProcessorDecorator
}
