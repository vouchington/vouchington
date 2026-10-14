/** One copied business instant for renewal eligibility; operational leases remain database-owned. */
export class RenewalBusinessTime {
  readonly #iso: string

  constructor(now: Date) {
    this.#iso = new Date(now.getTime()).toISOString()
  }

  get iso(): string {
    return this.#iso
  }
}
