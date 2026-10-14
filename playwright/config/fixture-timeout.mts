type Validation = (timeout: number, label: string) => number
type Watchpoint = { target: object; descriptors: PropertyDescriptorMap; prototype: object | null }
type Snapshot = { view: object; validate: Validation; watchpoints: Watchpoint[] }
const snapshots = new WeakMap<object, Snapshot>()

function watch(target: object): Watchpoint {
  return {
    target,
    descriptors: Object.getOwnPropertyDescriptors(target),
    prototype: Object.getPrototypeOf(target),
  }
}

function unchanged({ target, descriptors, prototype }: Watchpoint): boolean {
  const current = Object.getOwnPropertyDescriptors(target)
  const keys = Reflect.ownKeys(descriptors)
  return (
    Object.getPrototypeOf(target) === prototype &&
    keys.length === Reflect.ownKeys(current).length &&
    keys.every(key => {
      const before = Reflect.get(descriptors, key) as PropertyDescriptor
      const after = Reflect.get(current, key) as PropertyDescriptor | undefined
      return (
        after !== undefined &&
        before.get === after.get &&
        before.set === after.set &&
        Object.is(before.value, after.value) &&
        before.writable === after.writable &&
        before.enumerable === after.enumerable &&
        before.configurable === after.configurable
      )
    })
  )
}

export function snapshotFixtureTimeouts(fixtures: object, validate: Validation): object {
  const existing = snapshots.get(fixtures)
  if (existing !== undefined) {
    if (existing.validate !== validate || !existing.watchpoints.every(unchanged))
      throw new RangeError('Playwright fixture configuration changed after its deadline snapshot')
    return existing.view
  }
  if (Object.hasOwn(fixtures, 'vouchaTestTimeout'))
    throw new RangeError(
      'Playwright timeout guard overrides are forbidden by the 30,000 ms test cap',
    )
  const watchpoints: Watchpoint[] = []
  const view = Object.freeze(
    Object.fromEntries(
      Object.entries(fixtures).map(([name, value]) => {
        if (!Array.isArray(value)) return [name, value]
        const options = value[1]
        if (typeof options !== 'object' || options === null) return [name, value]
        const captured = snapshotOptionsTimeout(
          options,
          validate,
          `Playwright fixture ${name} timeout`,
        )
        const tuple: unknown[] = []
        Object.defineProperties(tuple, {
          0: { enumerable: true, get: () => Reflect.get(value, '0', value) },
          1: { enumerable: true, value: captured },
        })
        watchpoints.push(watch(value))
        for (
          let owner: object | null = options;
          owner !== null;
          owner = Object.getPrototypeOf(owner)
        ) {
          watchpoints.push(watch(owner))
          if (Object.hasOwn(owner, 'timeout')) break
        }
        return [name, Object.freeze(tuple)]
      }),
    ),
  )
  watchpoints.push(watch(fixtures))
  snapshots.set(fixtures, { view, validate, watchpoints })
  return view
}

export function snapshotOptionsTimeout(
  options: object,
  validate: Validation,
  label: string,
): object {
  const declared = Reflect.get(options, 'timeout')
  const timeout = declared === undefined ? undefined : validate(declared, label)
  return new Proxy(options, {
    get: (target, key) => (key === 'timeout' ? timeout : Reflect.get(target, key, target)),
  })
}
