import onError from '@modules/on-error'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'

export type BlueskyKindState = { cursor?: string; done: boolean }
export type BlueskyCombinedCursor = { a: BlueskyKindState; p: BlueskyKindState }
export type BlueskyKindResult<T> = {
  items: T[]
  next: BlueskyKindState
  attempted: boolean
  failed: boolean
}

const DEFAULT_KIND_STATE: BlueskyKindState = { done: false }

function readBlueskyKindState(value: unknown): BlueskyKindState {
  if (typeof value !== 'object' || value === null) return DEFAULT_KIND_STATE
  const parsed = value as Partial<BlueskyKindState>
  return {
    cursor: typeof parsed.cursor === 'string' ? parsed.cursor : undefined,
    done: parsed.done === true,
  }
}

// Bluesky cursors are opaque upstream tokens, not offsets: a kind that
// returns fewer items than its budget must be marked `done` (re-requesting
// the same token would repeat the same page), while a kind that was merely
// budget-starved this round (the other kind filled the page first) must
// stay `done: false` so it gets tried again once budget frees up.
export function decodeBlueskyCombinedCursor(cursor: string | undefined): BlueskyCombinedCursor {
  const raw = decodeFediverseCursor(cursor, 'bluesky')
  if (!raw) return { a: DEFAULT_KIND_STATE, p: DEFAULT_KIND_STATE }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<'a' | 'p', unknown>>
    return { a: readBlueskyKindState(parsed.a), p: readBlueskyKindState(parsed.p) }
  } catch {
    return { a: DEFAULT_KIND_STATE, p: DEFAULT_KIND_STATE }
  }
}

export function encodeBlueskyCombinedCursor(next: BlueskyCombinedCursor): string {
  return encodeFediverseCursor('bluesky', JSON.stringify(next))
}

// A kind's failure is isolated from its siblings: it reports `failed` with its cursor state
// left unchanged (retried next round) instead of throwing and discarding an already-fetched
// sibling's results.
export async function fetchBlueskyKind<R extends { cursor?: string }, T>(
  fetchFn: (cursor: string | undefined) => Promise<R>,
  extract: (response: R) => T[],
  state: BlueskyKindState,
  attempt: boolean,
): Promise<BlueskyKindResult<T>> {
  if (!attempt || state.done) {
    return { items: [], next: state, attempted: false, failed: false }
  }
  try {
    const response = await fetchFn(state.cursor)
    const items = extract(response)
    const done = !response.cursor
    return {
      items,
      next: { cursor: done ? undefined : response.cursor, done },
      attempted: true,
      failed: false,
    }
  } catch (error) {
    onError(error as Error)
    return { items: [], next: state, attempted: true, failed: true }
  }
}
