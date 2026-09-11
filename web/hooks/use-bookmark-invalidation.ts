'use client'

const emitter = new EventTarget()

export function emitBookmarkChange(
  entityType: string,
  entityId: string,
  predicate: string,
  sourceId: string,
): void {
  emitter.dispatchEvent(
    new CustomEvent(`${entityType}:${entityId}`, { detail: { predicate, sourceId } }),
  )
}

export function onBookmarkChange(
  entityType: string,
  entityId: string,
  callback: (predicate: string, sourceId: string) => void,
): () => void {
  const key = `${entityType}:${entityId}`
  const handler = (e: Event) => {
    const { predicate, sourceId } = (e as CustomEvent<{ predicate: string; sourceId: string }>)
      .detail
    callback(predicate, sourceId)
  }
  emitter.addEventListener(key, handler)
  return () => emitter.removeEventListener(key, handler)
}
