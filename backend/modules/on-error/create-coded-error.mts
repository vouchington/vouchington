import createHttpError from 'http-errors'

export function createCodedError(
  status: number,
  message: string,
  code: string,
): Error & { status: number; code: string } {
  const error = createHttpError(status, message) as unknown as Error & {
    status: number
    code: string
  }
  error.code = code
  return error
}
