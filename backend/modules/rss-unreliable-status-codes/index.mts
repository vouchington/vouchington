import createHttpError from 'http-errors'

export function readOptionalUnreliableStatusCodes(
  value: unknown,
  fieldName: string,
): number[] | null {
  if (value === null) return null
  assertValidUnreliableStatusCodes(
    Array.isArray(value),
    `${fieldName} must be an array of 4xx status codes or null`,
  )
  const statuses = value.map(status => {
    assertValidUnreliableStatusCodes(
      Number.isInteger(status) && status >= 400 && status < 500,
      `${fieldName} must contain only 4xx integer status codes`,
    )
    return status as number
  })
  return Array.from(new Set(statuses)).sort((a, b) => a - b)
}

function assertValidUnreliableStatusCodes(condition: boolean, message: string): asserts condition {
  if (condition) return
  throw createHttpError(400, message)
}
