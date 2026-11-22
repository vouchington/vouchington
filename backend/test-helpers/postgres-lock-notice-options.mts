import type { LockNoticeOptions } from 'vouchington-tooling/postgres-test-faults'

/** Voucha's disposable-database hint for every native lock-wait notice observation. */
export const testLockNoticeOptions: LockNoticeOptions = {
  applicationNamePrefix: 'copyright-lock',
  setupHint:
    "Run ./dev/initialize backend and verify DATABASE_URL points to this worktree's own disposable database.",
}
