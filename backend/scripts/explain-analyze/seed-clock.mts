import { SEED_ANCHOR_DATE_ENV, resolveSeedAnchor } from './seed-data/seed-anchor.mts'

// Services derive `time_range` cutoffs from `new Date()` while the fixture stamps posts at noon
// UTC on the seed anchor day, one minute apart. Under the wall clock, the number of posts inside
// a `1w` window moved about 60 per hour of run time, and the planner's choice between a parallel
// seq scan and a bitmap scan of `posts` flips with that window. EXPLAIN replays the captured SQL
// and values, so pinning the clock while a scenario callback builds its query fixes the cutoff
// for both captures and both plan-cache modes (#3022).
export async function withSeedAnchorClock<T>(callback: () => Promise<T>): Promise<T> {
  const { dayAnchorMs } = resolveSeedAnchor(process.env[SEED_ANCHOR_DATE_ENV])
  const RealDate = globalThis.Date
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) =>
      Reflect.construct(target, args.length === 0 ? [dayAnchorMs] : args, newTarget),
    get: (target, property) =>
      property === 'now' ? () => dayAnchorMs : Reflect.get(target, property, target),
  })
  try {
    return await callback()
  } finally {
    globalThis.Date = RealDate
  }
}
