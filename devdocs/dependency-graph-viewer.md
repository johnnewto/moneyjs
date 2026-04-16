# Dependency Graph Viewer

## Goal

Provide a dedicated equation dependency viewer without changing the existing
transaction-flow sequence diagram. The sequence diagram remains the
matrix/flow narrative view. The dependency graph focuses on equation
structure, solver-relevant dependencies, and explanatory grouping.

## Current Implementation

The dependency graph path is now implemented and lives in:

- [packages/web/src/notebook/dependencyGraph.ts](/home/john/repos/sfcr/packages/web/src/notebook/dependencyGraph.ts)
- [packages/web/src/components/DependencyGraphCanvas.tsx](/home/john/repos/sfcr/packages/web/src/components/DependencyGraphCanvas.tsx)
- [packages/web/src/notebook/dependencySectors.ts](/home/john/repos/sfcr/packages/web/src/notebook/dependencySectors.ts)

The sequence cell path resolves dependency sources from notebook models and
renders them in the notebook viewer through:

- [packages/web/src/notebook/NotebookCellView.tsx](/home/john/repos/sfcr/packages/web/src/notebook/NotebookCellView.tsx)

Current supported dependency view modes:

- `layered`
- `strips`

## Concepts To Keep Separate

The notebook still contains three distinct orderings that should not be
collapsed into one:

- notebook equation order
- solver / dependency order
- viewer spatial order

The current implementation intentionally relates them without making them
identical.

## What The Current Graph Builds

`buildDependencyGraph(...)` currently:

- parses notebook equations with the existing core parser
- extracts current and lagged dependencies
- includes exogenous inputs where they are graph-relevant
- computes strongly connected components for cyclic detection
- computes stable dependency layers
- classifies nodes into variable types
- preserves notebook equation index and deterministic ordering metadata

The graph output currently includes:

- nodes with type, role, layer, degree, cycle flags, dependency names, and
  optional descriptions
- edges that distinguish current and lagged dependencies
- graph-level parse and resolution errors

## Current Layout Modes

### Layered

The default layered mode uses:

- primary axis: dependency depth
- secondary axis: notebook order within layer

In practice:

```ts
x = layer * layerGap
y = withinLayerOrder * rowGap
```

This remains the clearest pure structural reading of the graph.

### Strips

The current `strips` mode is sector-oriented rather than row-oriented.

It:

- derives sector assignments from transaction and balance matrices
- maps variables to sectors using matrix columns and sector labels
- auto-discovers nearby matrix cells when explicit strip mapping is absent
- places mapped nodes into sector strips
- applies a 1D relaxation pass for unmapped nodes so they can float between
  sector strips rather than being forced into arbitrary buckets

This is the existing implementation that motivates the proposed
horizontal-strip extension.

## Current Node Classification

Node classification is already first-class graph data, not just visual
styling.

Current `VariableType` values are:

```ts
type VariableType = "parameter" | "auxiliary" | "flow" | "stock" | "exogenous";
```

Related equation role metadata is also preserved from parser analysis and used
for tooltips and interpretation.

The current classification influences:

- node styling
- graph summaries
- strip subtitles
- ordering within strip layouts

## Why The Current Shape Works

The existing viewer follows a pragmatic teaching shape:

- exogenous and parameter-like inputs first
- derived variables and flows in the middle
- stocks and accumulation results later

That gives a clearer causal picture than a generic free 2D force layout, while
still allowing limited soft placement in the strip view.

## Current Scope

Already shipped:

- equation dependency graph generation
- deterministic layered layout
- deterministic sector-strip layout
- current vs lagged edge rendering
- cycle-aware graph construction
- notebook-order intra-layer sorting
- matrix-driven sector mapping
- 1D relaxation for unmapped strip nodes

Still deferred or only partially explored:

- tighter linking between transaction-flow sequence view and dependency graph
- richer interaction around ambiguous node placement
- row-based accounting strips
- explicit multi-membership for variables across multiple accounting groups
- edge bundling or stronger clutter reduction for larger models

## Current File Shape

The existing matrix-sequence path remains intact:

- `packages/web/src/notebook/sequence.ts`
- `packages/web/src/components/SequenceDiagramCanvas.tsx`

The dependency path exists in parallel:

- `packages/web/src/notebook/dependencyGraph.ts`
- `packages/web/src/components/DependencyGraphCanvas.tsx`
- `packages/web/src/notebook/dependencySectors.ts`

This continues to reuse parser and dependency primitives from `packages/core`
rather than introducing a second parser stack in the web package.

## Next Extension

The next planned extension is a row-oriented horizontal-strip view derived from
transaction-matrix rows and balance-matrix rows, reusing the same soft 1D force
idea currently used for sector-strip positioning.

That follow-on plan is documented in:

- [devdocs/dependency-horizontal-strips-plan.md](/home/john/repos/sfcr/devdocs/dependency-horizontal-strips-plan.md)
