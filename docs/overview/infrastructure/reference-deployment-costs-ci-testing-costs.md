# Deployment Costs reference

[Back to Deployment Costs](deployment-costs.md)

## CI / Testing Costs

### Runners

CI is predominantly **self-hosted** — hardware and electricity costs are borne by
the infrastructure running the runners, not metered GitHub Actions minutes.

| Runner label                              | Approx. job count | Notes                                                      |
| ----------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `self-hosted`                             | ~54               | General-purpose, incl. Auto Harness automation jobs; gated |
| `self-hosted, Tests`                      | ~6                |                                                            |
| `self-hosted, macOS, Tests`               | ~5                | Swift client tests; Mac hardware                           |
| `self-hosted, Linux, Docker, Tests`       | ~4                |                                                            |
| `self-hosted, Linux, Docker`              | ~3                |                                                            |
| `self-hosted, Playwright`                 | ~2                | Browser E2E                                                |
| Other self-hosted labels                  | ~19               |                                                            |
| **Ubicloud** (`standard-2/4`, `browsers`) | ~9                | Paid external runners; minority of jobs                    |

Scheduling: 4 scheduled workflows. `scheduled-prompts.yml` emits six cron events per day (every
two hours from 08:00 through 18:00 UTC). Its entry job is skipped unless both default-off
`HARNESS_DISPATCH_ENABLED` and `HARNESS_SCHEDULED_ENABLED` gates are enabled; each admitted event
can create one provider session.

### GitHub Actions storage (metered)

- **Artifact retention**: every upload requests **1 day** and inter-job blobs are deleted after
  consumption; the repository's **3-day** artifact-and-log retention ceiling is otherwise unused,
  and stays at 3 days regardless so a diagnostic escalation still has fetchable logs.
- **Cache**: package caches are disallowed. See `docs/development/ci.md` for enforcement details.

### External CI SaaS

| Service      | Purpose                            | Billing model      |
| ------------ | ---------------------------------- | ------------------ |
| **Ubicloud** | Cloud runners for minority of jobs | Per-minute compute |

### LLM / AI automation spend

Two different billing models are in play here — conflating them overstates API
spend by roughly two orders of magnitude:

- **CI OpenAI spend is ~$1/month, measured.** Only 4 files make real
  credentialed OpenAI calls: `create-response.openai.test.mts` (2 one-word
  completions), `posts.openai.test.mts` (moderations endpoint, not
  token-billed), `openai-autotagger.openai.test.mts` (a tool loop, capped at
  `max_iterations: 1`), and `playwright/credentialed/chat.spec.mts` (one chat
  turn). At ~200 credentialed runs/month that's ~$0.005/run.
- **Scheduled Harness dispatch is default-off and externally billed.** The six daily
  `scheduled-prompts.yml` cron events skip the entry job unless both the master and scheduled
  surface gates are enabled. Each admitted event can create one provider session. Actual Harness
  provider/subscription cost must be measured before adding a dollar estimate here. Per-PR Claude (Anthropic)
  reviews are billed by their own provider plans, not the OpenAI key.
- **The actual driver is background ingestion in staging.** `ai_agents` worker
  traffic — the autotagger's per-RSS-item tool loop and the 7-moderator
  fan-out per post — runs continuously against staging's live OpenAI key and
  is unrelated to CI or PR volume. See
  [OpenAI Cost Model](../architecture/openai-cost-model.md) for the modeled
  per-unit costs, the production forecast, and the ~28× gap between modeled
  spend and what `OPENAI_TPM` structurally permits before anything throttles.

Monitor via the OpenAI dashboard once `api.usage.read` is granted (see that
doc's Recommendations). Config refs: `.github/workflows/scheduled-prompts.yml`,
`.github/workflows/tests-backend-credentialed.yml`,
`.github/workflows/tests-playwright-credentialed.yml`.
