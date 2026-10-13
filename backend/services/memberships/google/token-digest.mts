import { createHash } from 'node:crypto'

export function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
