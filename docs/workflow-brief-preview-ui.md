# Workflow Brief Preview UI

## Purpose and route

The internal preview page is available directly at `/internal/workflow-brief`. It lets a developer submit raw business requirement text and inspect the validated draft Workflow Brief returned by `POST /api/internal/workflow-brief/draft`.

The route is intentionally absent from production navigation. Every other client path continues to render the existing Mapper application.

## How to use it

1. Open `/internal/workflow-brief` in the client.
2. Enter a non-empty business requirement.
3. Select **Generate Draft Brief**.
4. Inspect the detection summary, capability suggestions, semantic routes, clarification questions, draft status, scaffolding warnings, and formatted raw JSON.
5. Use **Clear** to remove the local input and response.

## Current boundaries

- Only Router and Binary Decision detectors are available.
- The page calls only the isolated internal draft endpoint.
- Returned drafts are displayed without mutation, editing, confirmation, or locking.
- Input and responses are not persisted.
- No provider or Ollama calls are initiated by the page.
- No Mapper canvas nodes, graph generation, platform translation, or production Mapper integration is included.

