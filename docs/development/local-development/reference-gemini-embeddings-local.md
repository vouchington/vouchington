# Gemini Embeddings (local)

[Back to Dev Environment Reference](README.md#gemini-embeddings-local)

Local online embedding requests use Vertex AI's `embedContent` endpoint. Batch creation and polling
use the Google Cloud batch prediction API. Configure a development Google Cloud project and
application default credentials with access to the required Vertex AI model and batch resources.
Deployed environments use workload identity federation; follow the private infrastructure runbook
for the environment-specific setup.

The app reads the Vertex project from `VERTEX_PROJECT_ID`. Keep credentials in your local
credential store or generated `.env`; never copy credential values, project identities, or private
infrastructure output into this repository.

After configuring credentials, regenerate the worktree environment and restart backend services:

```bash
./dev/initialize web
./dev/stop-services
./dev/tmux
```

Use only an isolated development project. Local runs must not target staging or production
resources.
