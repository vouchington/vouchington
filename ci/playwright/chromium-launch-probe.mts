#!/usr/bin/env node
// Exit 0 when every Chromium flavor the repo's browser tests launch starts headless and closes
// cleanly, 1 otherwise. `setup-playwright` runs this to learn whether the host can run them before
// it spends an apt download on `playwright install-deps`. Any failure counts, and the cause is only
// printed, so the probe never depends on Playwright's error wording.

export interface LaunchedBrowser {
  close(): Promise<void>
}

export type BrowserLauncher = () => Promise<LaunchedBrowser>

export async function chromiumLaunchProbeExitCode(
  launches: readonly BrowserLauncher[],
): Promise<0 | 1> {
  try {
    for (const launch of launches) {
      const browser = await launch()
      await browser.close()
    }
    return 0
  } catch (err) {
    process.stderr.write(`Chromium failed to launch: ${String(err)}\n`)
    return 1
  }
}

if (import.meta.main) {
  // Imported lazily so an unresolvable Playwright is a failed probe, not an unhandled rejection.
  const chromium = async () => (await import('playwright')).chromium
  // Playwright Test launches the headless shell by default, while the Storybook browser provider
  // launches full Chromium (`channel: 'chromium'`). Both ship in `playwright install chromium`
  // and can need different host libraries, so the probe covers both.
  const launches: BrowserLauncher[] = [
    async () => (await chromium()).launch(),
    async () => (await chromium()).launch({ channel: 'chromium' }),
  ]
  // Exit explicitly so a leaked browser handle cannot hold the step open until its timeout.
  process.exit(await chromiumLaunchProbeExitCode(launches))
}
