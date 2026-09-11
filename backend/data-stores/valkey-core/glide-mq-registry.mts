const instances: Array<{ close(): Promise<void> }> = []

export function registerGlideMQInstance(instance: { close(): Promise<void> }): number {
  return instances.push(instance)
}

export function unregisterGlideMQInstance(instance: { close(): Promise<void> }): boolean {
  const index = instances.indexOf(instance)
  if (index === -1) return false
  instances.splice(index, 1)
  return true
}

export function getGlideMQInstances(): Array<{ close(): Promise<void> }> {
  return [...instances]
}

let sharedCommandClientShutdown: (() => Promise<void> | void) | null = null

export function setSharedCommandClientShutdown(fn: () => Promise<void> | void): void {
  sharedCommandClientShutdown = fn
}

export async function closeSharedCommandClientFromRegistry(): Promise<void> {
  await sharedCommandClientShutdown?.()
  sharedCommandClientShutdown = null
}
