// Shared `<renderer> <output-dir>` CLI body for the pages docs-publish renders onto the
// credentialed docs site. Returns the process exit code: 2 for usage, 1 for a render failure.
export async function runRenderDocsCli(
  argv: readonly string[],
  usage: string,
  render: (outputDir: string) => Promise<void>,
): Promise<number> {
  const [outputDir] = argv
  if (!outputDir) {
    console.error(usage)
    return 2
  }
  try {
    await render(outputDir)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
  return 0
}
