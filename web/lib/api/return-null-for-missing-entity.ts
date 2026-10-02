import { ApiError } from './error'

interface ReturnNullForMissingEntityOptions {
  nullStatusCodes?: number[]
}

export async function returnNullForMissingEntity<T>(
  request: Promise<T>,
  options: ReturnNullForMissingEntityOptions = {},
): Promise<T | null> {
  const nullStatusCodes = options.nullStatusCodes ?? [404]

  try {
    return await request
  } catch (err) {
    if (err instanceof ApiError && nullStatusCodes.includes(err.status)) {
      return null
    }

    throw err
  }
}
