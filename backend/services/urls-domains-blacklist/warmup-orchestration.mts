type BlocklistBloomFilterWarmup = {
  hasData: () => Promise<boolean>
  isReady: () => Promise<boolean>
  enqueueRebuild: () => Promise<void>
}

export async function warmUpBlocklistBloomFilter({
  hasData,
  isReady,
  enqueueRebuild,
}: BlocklistBloomFilterWarmup): Promise<void> {
  if (!(await hasData())) return
  if (await isReady()) return
  await enqueueRebuild()
}
