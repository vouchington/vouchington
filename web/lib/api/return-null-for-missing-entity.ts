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
  } catch (error) {
    if (error instanceof ApiError && nullStatusCodes.includes(error.status)) {
      return null
    }

    throw error
  }
}
