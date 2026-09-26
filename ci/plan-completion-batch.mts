const MAX_CONCURRENT_READS = 4

export async function mapPlanReads<Input, Output>(
  values: readonly Input[],
  read: (value: Input) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = []
  for (let offset = 0; offset < values.length; offset += MAX_CONCURRENT_READS) {
    results.push(
      ...(await Promise.all(values.slice(offset, offset + MAX_CONCURRENT_READS).map(read))),
    )
  }
  return results
}
