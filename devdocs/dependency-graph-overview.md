# Dependency Graph Overview

## Goal

Provide a dedicated dependency-graph view for notebook models without
changing the existing transaction-flow sequence diagram.

The sequence diagram remains the matrix and flow narrative view. The
dependency graph is the equation-structure view:

- solver-relevant dependencies
- current versus lagged links
- structural layering
- sector and accounting grouping
- lightweight debugging and layout diagnostics

## Current Implementation

The graph canvas and layout modules were removed. What remains:

- [packages/web/src/notebook/dependencyGraph.ts](/home/john/repos/sfcr/packages/web/src/notebook/dependencyGraph.ts) — `buildDependencyGraph` for layering, edges, and variable metadata
- [packages/web/src/notebook/components/DependencySequenceSummaryView.tsx](/home/john/repos/sfcr/packages/web/src/notebook/components/DependencySequenceSummaryView.tsx) — list/summary dependency sequence cells
- [packages/web/src/notebook/derivedAccountingTerms.ts](/home/john/repos/sfcr/packages/web/src/notebook/derivedAccountingTerms.ts) — matrix-derived accounting labels for the variable inspector
- Notebook assistant read tools (`getDependencyGraph`, equation validation)

Dependency sequence cells still use the sequence cell path; the UI is a summary list with inspect actions, not a rendered graph.

## Layout Module Map

The dependency graph layout code is split behind the stable
`dependencyGraphLayout.ts` entry point. That file remains the public
orchestrator used by `DependencyGraphCanvas`, while focused helper modules own
the pieces that were formerly embedded in one large layout file.

Current layout modules:

- [packages/web/src/components/dependencyGraphLayout.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphLayout.ts): public layout snapshot builder and main strip/accounting layout pipeline
- [packages/web/src/components/dependencyGraphLayoutTypes.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphLayoutTypes.ts): display node, positioned node, layout, render graph, and diagnostics types
- [packages/web/src/components/dependencyGraphLayoutConfig.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphLayoutConfig.ts): shared spacing, sizing, color, relaxation, and proxy-priority constants
- [packages/web/src/components/dependencyGraphLayoutDiagnostics.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphLayoutDiagnostics.ts): node box, overlap, exogenous placement, and cell-spread diagnostic construction
- [packages/web/src/components/dependencyGraphLayoutSectors.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphLayoutSectors.ts): display-sector resolution for canonical, mirror, and occurrence nodes
- [packages/web/src/components/dependencyGraphRenderGraph.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphRenderGraph.ts): base render graph construction, accounting proxy expansion, and sector occurrence expansion
- [packages/web/src/components/dependencyGraphAccountingBands.ts](/home/john/repos/sfcr/packages/web/src/components/dependencyGraphAccountingBands.ts): visible accounting bands, band labels, band render surfaces, placement assignment, and soft vertical anchors

The public exports should stay compatible through `dependencyGraphLayout.ts`.
Consumers that only need layout snapshots should not import these internal
modules directly.

## Core Concepts

The notebook still contains several different orderings that should stay
separate:

- notebook equation order
- solver or dependency order
- spatial order in the viewer
- accounting row membership
- sector membership

The implementation intentionally relates these orderings without collapsing
them into one.

## What The Graph Builds

`buildDependencyGraph(...)` currently:

- parses notebook equations using the existing parser stack
- extracts current and lagged dependencies
- includes exogenous inputs that are graph-relevant
- computes strongly connected components for cyclic detection
- computes stable dependency layers
- classifies nodes by variable type and equation role
- preserves deterministic ordering metadata such as notebook equation index

The graph output includes:

- nodes with type, role, layer, degree, cycle flags, dependency names, and
  optional descriptions
- edges that distinguish current and lagged dependencies
- graph-level parse and resolution errors

## View Modes And Modifiers

The viewer currently has two base layout modes:

- `Layered DAG`
- `Sector strips`

It also has modifiers:

- `Accounting strips`
- `Show exogenous`
- development-only `Show debug overlay`

This means the graph can be viewed as:

- plain layered structure
- sector strips
- layered structure with accounting strips
- sector strips with accounting strips

`Show exogenous` controls whether exogenous nodes are included in the visible
graph. When hidden, they are removed before the layout is built.

## Layered Mode

The layered mode is the clearest pure structural reading of the graph.

It uses:

- primary axis: dependency depth
- secondary axis: stable within-layer ordering

In practice:

```ts
x = layer * layerGap
y = withinLayerOrder * rowGap
```

This is the least interpretive layout and remains the baseline structural
view.

## Sector Strips

The sector-strip mode derives sector assignments from matrix columns.

It currently:

- derives sector assignments from transaction and balance matrices
- auto-discovers nearby matrix cells when explicit strip mapping is absent
- places mapped nodes into visible sector strips
- lets unmapped nodes float between sectors rather than forcing them into a
  misleading hard bucket
- hides the `Exogenous` and `Unmapped` sector columns from the main visible
  strip scaffold

This mode preserves the dependency graph while making sector structure easier
to read.

## Accounting Strips

Accounting strips add horizontal bands derived from transaction-matrix rows
and balance-matrix rows.

The implementation currently supports:

- row extraction from matrix rows
- explicit and inferred accounting memberships
- multiple memberships per variable
- hidden `Exogenous` and `Unmapped` accounting rows
- soft accounting anchoring for floating nodes
- accounting proxy nodes for multi-role variables such as:
  - `Mh`
  - `dMh`
  - `rm*Mh`
  - `Ld`
  - `dLd`
  - `rl*Ld`

When `Accounting strips` is enabled:

- variables can be anchored by accounting row rather than only by dependency
  layer or sector
- proxy nodes can expose different accounting roles for the same canonical
  variable
- sector strips and accounting strips can be combined in the same view

## Exogenous Placement

Exogenous nodes are currently treated as floating nodes rather than being
forced into a visible exogenous row or sector column.

The current exogenous placement logic includes:

- barycentric anchoring based on outgoing targets
- explicit handling for single-target and two-target cases
- deterministic fan-out for multiple exogenous nodes sharing one target
- weighted local placement refinement
- strong overlap avoidance
- debug diagnostics for saturation and spacing

Recent behavior is intentionally more flexible vertically so exogenous nodes
do not look rigidly attached to accounting bands.

## Edges And Interaction

The canvas currently supports:

- current versus lagged edge styling
- obstacle-aware edge control points
- sibling links between accounting proxy nodes
- hover highlighting of connected nodes and edges
- de-emphasis of unrelated nodes and links
- reduced arrowhead size relative to the original implementation

The edge routing is still heuristic rather than globally optimized, but it is
more structured than a plain cubic path between node centers.

## Diagnostics And Debug Overlay

The dependency graph now has a shared snapshot and diagnostics path in
[packages/web/src/components/DependencyGraphCanvas.tsx](/home/john/repos/sfcr/packages/web/src/components/DependencyGraphCanvas.tsx).

The shared snapshot builder exposes:

- final layout
- render graph
- node box diagnostics
- overlap pairs and overlap ratios
- exogenous placement diagnostics

The development-only debug overlay uses those diagnostics to render:

- node collision boxes
- exogenous barycenter markers and guide lines
- overlap links
- exogenous horizontal envelopes
- hard horizontal-gap markers
- bound-saturation hints

This overlay is intended for future layout work and should remain derived
from the same diagnostics used by tests.

## Regression Coverage

The web test suite now includes dependency-graph diagnostics coverage in:

- [packages/web/test/dependencyGraph.test.ts](/home/john/repos/sfcr/packages/web/test/dependencyGraph.test.ts)

Current regression coverage checks:

- reusable layout diagnostics are produced for BMW-style accounting-strip
  layouts
- exogenous placement diagnostics are present
- overlap metrics remain bounded

The diagnostic test can also emit env-gated debug output for local
investigation.

## Current Strengths

The current viewer is strongest at:

- showing solver structure clearly in layered mode
- aligning graph reading with sector groupings
- aligning graph reading with accounting rows
- exposing ambiguous accounting roles via proxies rather than hiding them
- keeping layout deterministic enough for teaching and regression testing

## Known Limits

The implementation still uses pragmatic local heuristics rather than a full
constrained optimization pass.

Open limits include:

- edge clutter in denser models
- heuristic sensitivity for floating exogenous placement
- imperfect balancing of semantic anchor versus de-crowding terms
- lack of a full constrained annealing or optimization pass

These are recognized tradeoffs rather than accidental omissions.

## Related Plan Documents

The broader accounting-strip and optimization plan lives in:

- [dependency-horizontal-strips-plan.md](/home/john/repos/sfcr/devdocs/dependency-horizontal-strips-plan.md)

That document should be read as the forward-looking plan. This overview
documents the current dependency graph implementation and its present layout
behavior.
