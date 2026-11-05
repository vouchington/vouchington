import { v7 as uuidv7 } from 'uuid'

/** Allocate an owned post id before a fixture write so failures can still be cleaned up. */
export function createTestPostId(createdAt: Date): string {
  return uuidv7({ msecs: createdAt.getTime() })
}
