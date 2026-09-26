export function invokeProcessor<TInput, TResult>(
  input: TInput,
  dependencies: {
    process?: (input: TInput, now: Date) => Promise<TResult>
    now?: () => Date
  },
  fallback: (input: TInput, now: Date) => Promise<TResult>,
): Promise<TResult> {
  const process = dependencies.process ?? fallback
  return process(input, (dependencies.now ?? (() => new Date()))())
}
