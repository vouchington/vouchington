import { describe, expect, it } from 'vitest'
import { BedrockControlClient } from './bedrock-control.mts'

describe('BedrockControlClient', () => {
  it('preserves receivers for proxy target and SDK client methods', () => {
    const targetMarker = Symbol('targetMarker')
    const methodName = Symbol('methodName')
    const markerName = Symbol('markerName')
    const proxyTarget = BedrockControlClient as unknown as {
      [markerName]: symbol
      [methodName]: () => symbol
      destroy: () => void
    }
    Object.defineProperty(proxyTarget, markerName, {
      configurable: true,
      value: targetMarker,
    })
    Object.defineProperty(proxyTarget, methodName, {
      configurable: true,
      value() {
        return this[markerName]
      },
    })

    expect(proxyTarget[methodName]()).toBe(targetMarker)
    expect(() => proxyTarget.destroy()).not.toThrow()
  })
})
