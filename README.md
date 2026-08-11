# Hodor Web

Hodor Web is the React control room for Hodor's Studio OS. It keeps story decisions, director context, recursive production, adopted assets, worker leases, verification, and evolution evidence in one project-group view.

This repository is a client of Hodor's HTTP authority. The browser reads database truth through Hodor, keeps no second production state store, and exposes no production-publish action.

## Implemented

The project workspace is still available under `/projects/$projectId`. The Studio OS control room is available at `/projects/$projectId/studio-os`; pass `groupId` as a search parameter when a Hodor project uses an explicit project-group identifier. Without it, the route reads `project-${projectId}`.

The control room reads `/api/studio-os-vnext/groups/:groupId/snapshot` and presents:

- project-group, story-room, and director-room context;
- the recursive task graph from parent/child and asset dependencies;
- asset provenance, adoption state, and downstream invalidation impact;
- active worker leases and the EPYC evidence entry;
- failed candidate verifications and failed or invalidated tasks, grouped with evidence references;
- replay, shadow, canary, and rollback readback derived from ordered Hodor events;
- independently verified candidate adoption and exact task-scoped adoption rollback through Hodor commands.

The page renders `not reported` when an evolution event or evidence reference is absent. It does not infer readiness from a phase label.

## Fixture verification

The control-room tests use an in-memory authority response fixture. They verify group isolation, recursive impact calculation, failure aggregation, ordered evolution readback, deterministic adoption/rollback idempotency keys, the database-download authorization path, error rendering, and the absence of a publish action. No provider call, production publish, asset deletion, or cross-project read occurs during these tests.

## Local development

Use Bun 1.3.5 or newer and run Hodor at `http://127.0.0.1:10588`.

```bash
bun install --frozen-lockfile
bun run dev --host 127.0.0.1
```

Open [http://127.0.0.1:50288/](http://127.0.0.1:50288/). Vite proxies `/api`, `/assets`, `/oss`, and `/skills` to the local Hodor process.

## Verification and release

```bash
bun run test
bun run type-check
bun run build
bun run test:release
```

To sync the built app into Hodor's `data/web` directory:

```bash
HODOR_APP_DIR=/absolute/path/to/hodor bun run publish:hodor
```

React is the only application entry point. Browser and Electron use the same pages; Electron resolves its backend through `hodor://` and controls the frameless window.

## Boundaries

- Pancat session tokens are sent only to Hodor HTTP and Socket.IO requests. A failed database download now uses the same authenticated download path as other protected file requests and clears the session on HTTP 401.
- Hodor owns project, contract, task, asset, verification, lease, adoption, rollback, and evidence truth.
- Media pages keep stable asset references and receipts; provider secrets never enter the frontend bundle, repository, or logs.
- Long-running work remains server-owned. The UI reads status and evidence, then re-reads the authority after an adoption or rollback command.
- The control room is an observability and bounded-decision surface. Production publishing remains outside its scope.

See [system status](./docs/system-status.md) for the wider workspace contract. The Chinese implementation notes are in [README.zh-CN.md](./README.zh-CN.md).

## License and upstream

Hodor Web is adapted from [HBAI-Ltd/Toonflow-web](https://github.com/HBAI-Ltd/Toonflow-web) for internal use. Use and modification remain subject to [LICENSE](./LICENSE), including the retained Toonflow notices and source records.

The 3D director desk is adapted from [jiguang132/storyai-3d-director-desk](https://github.com/jiguang132/storyai-3d-director-desk), pinned to `8c8bd361790be4d37158a7430365e65546e358fe`. Its license, model-material notice, and source record remain under `vendor/storyai-3d-director-desk/`.
