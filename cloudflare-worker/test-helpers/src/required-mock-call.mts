export function requiredMockCall<T>(calls: readonly T[], index: number): T {
  const call = calls[index]
  if (call === undefined) {
    throw new Error(`Expected mock call at index ${index}; received ${calls.length} calls`)
  }
  return call
}
