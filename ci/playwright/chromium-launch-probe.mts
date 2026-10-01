#!/usr/bin/env node
// Exit 0 when the installed Playwright Chromium starts headless and closes cleanly, 1 otherwise.
// `setup-playwright` runs this to learn whether the host can run the browser before it spends an
// apt download on `playwright install-deps`. Any failure counts, and the cause is only printed, so
// the probe never depends on Playwright's error wording.

export interface LaunchedBrowser {
  close(): Promise<void>
}

export async function chromiumLaunchProbeExitCode(
  launch: () => Promise<LaunchedBrowser>,
): Promise<0 | 1> {
  try {
    const browser = await launch()
    await browser.close()
    return 0
  } catch (error) {
    process.stderr.write(`Chromium failed to launch: ${String(error)}\n`)
    return 1
  }
}

if (import.meta.main) {
  // Imported lazily so an unresolvable Playwright is a failed probe, not an unhandled rejection.
  const launch = async () => (await import('playwright')).chromium.launch()
  // Exit explicitly so a leaked browser handle cannot hold the step open until its timeout.
  process.exit(await chromiumLaunchProbeExitCode(launch))
}
