# Workflow automation: Main

[Back to Workflow automation map](reference-workflow-automation-map.md) · [Back to Workflow Reference](../../../../.github/workflows/README.md)

Each deployable workflow publishes its artifact independently after queue validation. When one succeeds from a push,
`dispatch-completed-deploy` sends its event to the private infrastructure receiver, which owns
deploy ordering; the event names are in the
[deployment CI/CD flow](../../../overview/infrastructure/reference-deployment-ci-cd-flow.md).
`fix-main` subscribes to the main publication workflows and to scheduled or manually dispatched
`Nightly` failures on the trusted main branch, then hands failures to Auto Harness. The
[Always run](reference-workflow-automation-always-run.md) checks validate PRs and merge groups,
not main pushes.

```mermaid
flowchart TD
    main-push["push to main"]

    subgraph deployables["Deployable workflows"]
        subgraph main-backend["main-backend"]
            mb-detect["detect-image-publication"]
            mb-detect --> mb-intent["backend-deploy-intent"]
            mb-detect --> mb-publish["publish-backend-images"]
        end
        subgraph main-web["main-web"]
            mw-detect["detect-image-publication"]
            mw-detect --> mw-intent["web-deploy-intent"]
            mw-detect --> mw-publish["publish-web-images"]
        end
        subgraph main-cloudflare-worker["main-cloudflare-worker"]
            mcw-publish["publish-cloudflare-worker"]
        end
        subgraph main-lambdas["main-lambdas"]
            ml-publish["publish-image-resize"]
        end
        subgraph main-storybook["main-storybook"]
            ms-publish["publish-storybook"]
        end
        docs-publish["docs-publish<br/>(docs artifact)"]
        sync-articles["sync-articles<br/>(articles artifact)"]
    end

    nightly["nightly<br/>(full area suites)"]
    plan-completion["plan-completion<br/>(advisory only)"]

    main-push --> deployables
    main-push --> plan-completion
    nightly -. "failure from schedule or manual main run" .-> fix-main
    deployables -. "workflow_run success from push" .-> dispatch-completed-deploy["dispatch-completed-deploy"]
    dispatch-completed-deploy --> infra-receiver["private infrastructure receiver<br/>(one event per deployable)"]

    deployables -. "failure" .-> fix-main["fix-main<br/>(Auto Harness fix)"]
    dispatch-completed-deploy -. "failure" .-> fix-main
    fix-main --> harness-dispatch["harness-dispatch<br/>(reusable)"]
    fix-main -. "workflow_run completed" .-> fix-main-self-retry["fix-main-self-retry"]
    fix-main-self-retry -. "bounded rerun" .-> fix-main
```
