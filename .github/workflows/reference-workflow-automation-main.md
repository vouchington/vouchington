# Workflow automation: Main

[Back to Workflow automation map](reference-workflow-automation-map.md) · [Back to Workflow Reference](README.md)

Each deployable workflow validates and publishes on its own. When one succeeds from a push,
`dispatch-completed-deploy` sends its event to the private infrastructure receiver, which owns
deploy ordering; the event names are in the
[deployment CI/CD flow](../../docs/overview/infrastructure/reference-deployment-ci-cd-flow.md).
`fix-main` subscribes to every workflow that runs on `main`, including the
[Always run](reference-workflow-automation-always-run.md) checks, and hands failures to Auto
Harness.

```mermaid
flowchart TD
    main-push["push to main"]

    subgraph deployables["Deployable workflows"]
        subgraph main-backend["main-backend"]
            mb-static["static-checks"]
            mb-static --> mb-tests["modules, unit, smoke,<br/>credentialed, schema tests"]
            mb-static --> mb-publish["publish-backend-images"]
        end
        subgraph main-web["main-web"]
            mw-detect["detect-web-deploy"]
            mw-static["static-checks"]
            mw-detect --> mw-intent["web-deploy-intent"]
            mw-detect & mw-static --> mw-publish["publish-web-images"]
            mw-static --> mw-tests["test-web, test-web-api,<br/>test-web-integration"]
            mw-static --> mw-playwright["playwright-tests,<br/>playwright-credentialed-tests"]
            mw-playwright --> mw-otel["store-playwright-otel"]
            mw-tests & mw-playwright & mw-otel --> mw-cleanup["cleanup-artifacts<br/>(no failures)"]
        end
        subgraph main-cloudflare-worker["main-cloudflare-worker"]
            mcw-static["static-checks"]
            mcw-static --> mcw-tests["cloudflare-worker-tests"]
            mcw-static & mcw-tests --> mcw-publish["publish-cloudflare-worker"]
        end
        subgraph main-lambdas["main-lambdas"]
            ml-static["static-checks"]
            ml-static --> ml-tests["lambdas-tests"]
            ml-static & ml-tests --> ml-publish["publish-image-resize"]
        end
        subgraph main-storybook["main-storybook"]
            ms-build["storybook-build"]
            ms-build --> ms-publish["publish-storybook"]
        end
        docs-publish["docs-publish<br/>(docs artifact)"]
        sync-articles["sync-articles<br/>(articles artifact)"]
    end

    subgraph check-only["Check-only workflows"]
        subgraph main-checks["main-checks"]
            mc-select["select-main-checks"]
            mc-select --> mc-tests["tooling, ts-shared,<br/>explain-analyze"]
            mc-tests --> mc-cleanup["cleanup-artifacts<br/>(no failures)"]
        end
        static-code-analysis["static-code-analysis<br/>(also a CI job)"]
        tests-portability["tests-portability<br/>(also a CI job)"]
    end

    always-checks["gitleaks, actionlint, lint-links<br/>(see Always run)"]

    main-push --> deployables
    main-push --> check-only
    deployables -. "workflow_run success from push" .-> dispatch-completed-deploy["dispatch-completed-deploy"]
    dispatch-completed-deploy --> infra-receiver["private infrastructure receiver<br/>(one event per deployable)"]

    deployables -. "failure" .-> fix-main["fix-main<br/>(Auto Harness fix)"]
    check-only -. "failure" .-> fix-main
    always-checks -. "failure on main" .-> fix-main
    dispatch-completed-deploy -. "failure" .-> fix-main
    fix-main --> harness-dispatch["harness-dispatch<br/>(reusable)"]
    fix-main -. "workflow_run completed" .-> fix-main-self-retry["fix-main-self-retry"]
    fix-main-self-retry -. "bounded rerun" .-> fix-main
```
