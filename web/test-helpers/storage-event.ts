// The web setup supplies an in-memory Storage rather than jsdom's branded Storage.
export function dispatchStorageEvent(key: string | null, storageArea: Storage): void {
  const event = new StorageEvent('storage', { key })
  Object.defineProperty(event, 'storageArea', { value: storageArea })
  window.dispatchEvent(event)
}
