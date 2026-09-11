import onError from '@modules/on-error'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'

export type LemmyKindState = { page: number; done: boolean }
export type LemmyCombinedCursor = { p: LemmyKindState; u: LemmyKindState; c: LemmyKindState }
export type LemmyKindResult<T> = {
  items: T[]
  next: LemmyKindState
  attempted: boolean
  failed: boolean
}

const DEFAULT_KIND_STATE: LemmyKindState = { page: 1, done: false }

function readLemmyKindState(value: unknown): LemmyKindState {
  if (typeof value !== 'object' || value === null) return DEFAULT_KIND_STATE
  const parsed = value as Partial<LemmyKindState>
  const page =
    typeof parsed.page === 'number' && Number.isFinite(parsed.page) && parsed.page >= 1
      ? parsed.page
      : 1
  return { page, done: parsed.done === true }
}

// Lemmy's `page` is a page INDEX, not an offset: re-requesting an exhausted
// page returns the same items again, so each kind (posts/users/communities)
// tracks its own page + done state — blindly advancing one shared page past
// a kind that wasn't fetched this round would skip that kind's unfetched
// page entirely.
export function decodeLemmyCombinedCursor(cursor: string | undefined): LemmyCombinedCursor {
  const raw = decodeFediverseCursor(cursor, 'lemmy')
  if (!raw) return { p: DEFAULT_KIND_STATE, u: DEFAULT_KIND_STATE, c: DEFAULT_KIND_STATE }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<'p' | 'u' | 'c', unknown>>
    return {
      p: readLemmyKindState(parsed.p),
      u: readLemmyKindState(parsed.u),
      c: readLemmyKindState(parsed.c),
    }
  } catch {
    return { p: DEFAULT_KIND_STATE, u: DEFAULT_KIND_STATE, c: DEFAULT_KIND_STATE }
  }
}

export function encodeLemmyCombinedCursor(next: LemmyCombinedCursor): string {
  return encodeFediverseCursor('lemmy', JSON.stringify(next))
}

// A kind's failure is isolated from its siblings: it reports `failed` with its cursor state
// left unchanged (retried next page) instead of throwing and discarding already-fetched kinds.
export async function fetchLemmyKind<R, T>(
  fetchFn: (page: number, budget: number) => Promise<R>,
  extract: (response: R) => T[],
  state: LemmyKindState,
  budget: number,
  include: boolean,
): Promise<LemmyKindResult<T>> {
  if (!include || budget <= 0 || state.done) {
    return { items: [], next: state, attempted: false, failed: false }
  }
  try {
    const response = await fetchFn(state.page, budget)
    const items = extract(response)
    const done = items.length < budget
    return {
      items,
      next: { page: done ? state.page : state.page + 1, done },
      attempted: true,
      failed: false,
    }
  } catch (error) {
    onError(error as Error)
    return { items: [], next: state, attempted: true, failed: true }
  }
}
