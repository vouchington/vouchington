import assert from 'http-assert'

const individualCardConstraintErrors: Readonly<Record<string, string>> = {
  '23503:individual_cards_authorized_user_of_id_fkey': 'Invalid authorized_user_of_id',
  '23514:individual_cards_check1':
    'is_authorized_user must be true when authorized_user_of_id is set',
}

export async function mapIndividualCardConstraintError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const pgError = error as { code?: string; constraint?: string }
    const key =
      pgError.code && pgError.constraint ? `${pgError.code}:${pgError.constraint}` : undefined
    const message = key ? individualCardConstraintErrors[key] : undefined
    if (!message) throw error
    assert(false, 422, message)
  }
}
