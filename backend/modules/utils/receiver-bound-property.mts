// Re-read the method on call so `this` is the source object. AWS and OpenAI SDK
// methods fail when a proxy returns them unbound.
export function getReceiverBoundProperty(target: object, prop: string | symbol): unknown {
  const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
  const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
  return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
}
