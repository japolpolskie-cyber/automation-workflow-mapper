# Automation Workflow Mapper

Automation Workflow Mapper turns a business scope into an explainable, platform-aware automation blueprint. It separates business intent from deterministic workflow topology, grounds nodes and edges against known capabilities, and presents the result through Business, Automation, Developer, and Client Handoff views.

The product creates implementation plans for Zapier, Make.com, and n8n. Outputs are planning artifacts for expert review; they are not deployed to automation platforms automatically.

## Current status

The project is an active local-first product preview. Completed foundations include:

- canonical workflow contracts, migrations, validation, and versioned project storage;
- deterministic scope intelligence and knowledge retrieval;
- a deterministic skeleton compiler for decisions, routes, loops, retries, iterators, and merges;
- capability-constrained node grounding and deterministic semantic edge grounding;
- platform comparison and implementation-plan exports;
- multiple independent workflow views, workflow readiness, node status, platform badges, semantic edge labels, and client handoff.

Planner infrastructure is in maintenance mode. Stage C and Stage D remain feature-controlled. K5 has not started.

## Architecture

```text
Scope and documents
        |
        v
Deterministic analysis and knowledge retrieval
        |
        v
Business meaning + clarifications
        |
        v
Deterministic skeleton compiler
        |
        +--> Stage C capability grounding
        |
        +--> Stage D edge grounding
        |
        v
Canonical workflow (source of truth)
        |
        +--> Business / Automation / Developer / Handoff views
        +--> Zapier / Make / n8n build plans
        +--> Validation and export
```

The canonical workflow is the persisted source of truth. Canvas positions, workflow cards, readiness, platform recommendations, and layered views are derived projections. UI workflow separation therefore does not change stored workflow data.

## Technology stack

- React 19, TypeScript, Vite, React Flow, Zustand, and Dagre
- Fastify, Zod, and Node SQLite
- npm workspaces
- Vitest, Testing Library, ESLint, and Prettier
- Optional local AI through Ollama; optional OpenAI-compatible provider

## Folder structure

```text
apps/
  client/       React product interface
  server/       API, analysis, planner orchestration, and persistence
packages/
  shared/       Platform-neutral contracts and deterministic domain logic
  knowledge/    Versioned application and operation knowledge
  platforms/    Zapier, Make, and n8n adapters
docs/           Maintained architecture documentation
outputs/        Review reports and benchmark evidence
```

## Development setup

Requirements: Node.js 22.13 or newer, npm 10 or newer, and optionally [Ollama](https://ollama.com/) for free local model execution.

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`; health is available at `GET /api/health`.

For local Ollama:

```bash
ollama pull qwen3:8b
```

Set `AI_PROVIDER=ollama` and `OLLAMA_MODELS=qwen3:8b` in `.env`, start Ollama, and restart the application. Credentials and local databases must never be committed.

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Roadmap

- validate product-polish behavior with representative client projects;
- improve workflow handoff and platform-specific implementation guidance;
- prepare controlled product rollout and usability testing;
- begin K5 only after explicit approval.

## Safety and limitations

- Platform recommendations can contain explicit limitations or workarounds.
- Generated plans require a human review before implementation.
- Unsupported capabilities are shown rather than silently fabricated.
- Local models can be slower and less reliable than hosted models.
- Multiple workflow cards are currently a non-persisted UI projection of independent trigger chains.

## License

License selection is pending. Treat this repository as private and all rights reserved until a `LICENSE` file is approved.
