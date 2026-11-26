import { COPYRIGHT_SUBMISSION_IN_PROGRESS } from '@modules/on-error/error-codes'
import { isUniqueViolation } from '@vouchington/postgres'
import createHttpError from 'http-errors'

export function throwCopyrightSubmissionRequestConflict(err: unknown, constraint: string): never {
  if (isUniqueViolation(err) && 'constraint' in err && err.constraint === constraint) {
    throw createHttpError(409, 'Copyright submission in progress. Try again.', {
      code: COPYRIGHT_SUBMISSION_IN_PROGRESS,
      cause: err,
    })
  }
  throw err
}
