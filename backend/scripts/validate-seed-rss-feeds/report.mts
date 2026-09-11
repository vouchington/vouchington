import type { FeedEntry, ProbeResult } from './probe.mts'

type FeedProbeResult = FeedEntry & { result: ProbeResult }

export function printProbeReport(results: FeedProbeResult[], elapsed: string) {
  const ok = results.filter(r => r.result.status === 'ok')
  const permanent = results.filter(r => r.result.status === 'permanent')
  const transient = results.filter(r => r.result.status === 'transient')

  console.log(
    `Results in ${elapsed}s: ${ok.length} OK, ${permanent.length} permanent errors, ${transient.length} transient errors\n`,
  )

  if (ok.length > 0) {
    console.log(`=== OK (${ok.length}) ===`)
    for (const r of ok) {
      console.log(`  [${r.result.httpStatus}] ${r.slug}`)
    }
    console.log()
  }

  if (permanent.length > 0) {
    console.log(`=== PERMANENT ERRORS (${permanent.length}) — must fix ===`)
    for (const r of permanent) {
      const res = r.result as Extract<ProbeResult, { status: 'permanent' }>
      console.log(`  [${res.httpStatus}] ${r.slug}`)
      console.log(`    url:    ${r.url}`)
      if (res.finalUrl !== r.url) console.log(`    final:  ${res.finalUrl}`)
      console.log(`    reason: ${res.reason}`)
    }
    console.log()
  }

  if (transient.length > 0) {
    console.log(`=== TRANSIENT ERRORS (${transient.length}) — may retry ===`)
    for (const r of transient) {
      const res = r.result as Extract<ProbeResult, { status: 'transient' }>
      console.log(`  [${res.httpStatus ?? 'net'}] ${r.file}:${r.slug}`)
      console.log(`    url:    ${r.url}`)
      if (res.finalUrl !== r.url) console.log(`    final:  ${res.finalUrl}`)
      console.log(`    reason: ${res.reason}`)
    }
    console.log()
  }

  // Machine-readable output for scripting
  console.log('--- json ---')
  console.log(
    JSON.stringify(
      results.map(r => ({
        file: r.file,
        slug: r.slug,
        url: r.url,
        status: r.result.status,
        httpStatus: r.result.httpStatus,
        finalUrl: r.result.finalUrl,
        reason: 'reason' in r.result ? r.result.reason : undefined,
      })),
      null,
      2,
    ),
  )
  return { permanent, transient }
}
