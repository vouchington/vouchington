declare module 'http-assert' {
  function assert(
    condition: unknown,
    statusCode: number,
    message?: string,
    options?: { cause?: unknown },
  ): asserts condition
  export = assert
}
