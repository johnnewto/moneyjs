# Dependency Horizontal Strips Plan

## Goal

Add a new dependency-graph view mode that overlays horizontal accounting
bands derived from transaction-matrix rows and balance-matrix rows.

This is an extension of the existing dependency `strips` mode, not a separate
visualization family. The dependency graph should keep its structural meaning:

- primary axis: dependency depth / solver order
- secondary axis: accounting row membership

For BMW, the intended row bands come from the existing notebook matrices, for
example:

- `Consumption`
- `Investment`
- `Wages`
- `Depreciation`
- `Interest loans`
- `Interest on deposits`
- `Ch. deposits`
- `Money deposits`
- `Loans`
- `Fixed capital`
- `Balance (net worth)`

## Current Status

Implemented in the current codebase:

- row-based accounting membership extraction from transaction and balance
  matrices
- conservative inferred memberships for structurally important variables
- hidden `Exogenous` and `Unmapped` accounting rows in the visible strip view
- `Accounting strips` as a modifier that can be combined with both
  `Layered DAG` and `Sector strips`
- accounting proxy nodes for multi-role variables such as `Mh`, `Ld`, and
  related row-expression or change forms
- deterministic accounting-strip layouts in both layered and sector-strip
  modes
- hover highlighting, proxy sibling links, obstacle-aware edge routing, and
  debug diagnostics
- development-only overlay and BMW-oriented regression diagnostics

Still open or exploratory:

- additional tuning of exogenous multi-target weighting
- stronger semantics for two-target midpoint placement such as `rl`
- broader layout cleanup beyond the current local heuristics
- any constrained annealing or optimization pass

## Why Add It

The current dependency graph is equation-first. The proposed horizontal-strip
view would add an accounting-first reading of the same structure.

Expected benefits:

- align the dependency graph with the transaction-flow and balance-sheet views
- make the BMW notebook easier to teach and explain
- preserve dependency structure while exposing accounting semantics
- support ambiguous variables more honestly than a hard single-row assignment

## Core Design

Use horizontal strips as soft constraints, not hard containers.

The recommended mental model is:

- `x`: stable dependency depth, same as the current layered view
- `y`: attracted toward one or more accounting-row bands
- edge attraction: keeps connected variables locally coherent
- node repulsion: reduces overlap inside crowded bands
- strip attraction: keeps nodes near relevant accounting rows

This reuses the same basic idea as the existing 1D force behavior in sector
strip mode, but applies it on the vertical axis.

## Architectural Direction

Do not build this as BMW-specific layout logic inside the canvas component.

Instead, split the work into:

1. membership extraction from notebook matrices
2. inferred membership enrichment for non-literal variables
3. a general strip-constrained layout pass
4. a renderer that can display horizontal bands

The key change is to move from a single dominant sector assignment per variable
to weighted multi-membership.

Suggested internal shape:

```ts
interface VariableGroupMembership {
  variable: string;
  group: string;
  weight: number;
  source: "transaction-row" | "balance-row" | "explicit" | "inferred";
  confidence: "high" | "medium" | "low" | "fallback";
  accountKind?: "flow" | "stock" | "auxiliary" | "exogenous";
}
```

## Phase 1: Generalize The Mapping Layer

Status: implemented

Current state:

- [packages/web/src/notebook/dependencySectors.ts](/home/john/repos/sfcr/packages/web/src/notebook/dependencySectors.ts)
  maps variables to one sector using matrix columns
- the current strips view in
  [packages/web/src/components/DependencyGraphCanvas.tsx](/home/john/repos/sfcr/packages/web/src/components/DependencyGraphCanvas.tsx)
  uses that single assignment

Required change:

- keep the current sector mapping path working
- add a more general membership model that supports one-to-many assignments
- preserve source provenance and confidence so the UI can explain placement

This is the main enabling refactor. Without it, row-based strips will force
arbitrary and misleading hard assignments.

## Phase 2: Extract Row Memberships From Matrices

Status: implemented

Add a row-oriented extractor in parallel to the current sector extractor.

For each matrix:

- ignore the `Sum` row
- create one candidate band per row label
- extract variable references from every populated cell in that row
- assign each variable membership in that row

Transaction matrix rows should emit memberships with source
`transaction-row`. Balance-sheet rows should emit memberships with source
`balance-row`.

For BMW this should produce explicit memberships such as:

- `Cd`, `Cs` -> `Consumption`
- `Id`, `Is` -> `Investment`
- `WBs`, `WBd` -> `Wages`
- `AF` -> `Depreciation`
- `Mh`, `Ms` -> `Ch. deposits`
- `Mh`, `Ms` -> `Money deposits`
- `Ld`, `Ls` -> `Ch. loans`
- `Ld`, `Ls` -> `Loans`
- `rm`, `Mh`, `Ms` -> `Interest on deposits`
- `rl`, `Ld`, `Ls` -> `Interest loans`

## Phase 3: Add Conservative Inference

Status: implemented in a conservative first pass

Literal row extraction will not cover all structurally important variables.
BMW already has examples:

- `Y`
- `YD`
- `W`
- `Nd`
- `Ns`
- `KT`
- `DA`

Add a second pass that infers additional row memberships with lower
confidence.

Suggested confidence rules:

- `high`: variable token appears directly in a row expression
- `medium`: direct equation alias / identity strongly tied to row members
- `low`: one-edge structural inference from nearby row members
- `fallback`: no convincing accounting-row match

Conservative BMW expectations:

- `YD` should lean toward `Wages` and `Interest on deposits`
- `W`, `Nd`, `Ns` should lean toward `Wages`
- `DA` should lean toward `Depreciation`
- `Y` may have weak multi-membership across `Consumption`, `Investment`, and
  `Wages`
- `KT` should remain weakly assigned or unmapped unless the inference is
  clearly useful

Important constraint:

- do not overfit inference to BMW
- prefer leaving variables weakly assigned or unmapped over making a confident
  but wrong accounting claim

Current implementation note:

- the first-pass inference already covers examples such as `YD`, `W`, `Nd`,
  `Ns`, `DA`, and `KT`
- hidden `Unmapped` and `Exogenous` rows are no longer shown as visible bands
  in the accounting-strip layout

## Phase 4: Define Horizontal Band Ordering

Status: implemented

The first implementation should prefer stable and user-facing ordering over a
derived heuristic.

Default order:

1. transaction rows in matrix order
2. balance rows in matrix order
3. utility bands such as `Exogenous`, `Auxiliary`, or `Unmapped` if needed

Why:

- matrix order matches the teaching material
- it is deterministic
- it avoids introducing another opaque ranking rule

Current implementation note:

- visible ordering follows transaction rows first, then balance rows
- utility rows such as `Exogenous` and `Unmapped` are retained in topology
  metadata but hidden from the visible accounting strip scaffold

## Phase 5: Build The Layout Algorithm

Status: implemented as deterministic heuristic layout, still tunable

Add a new dependency view mode, conceptually `horizontal-strips`.

Recommended layout process:

1. compute base `x` from dependency layer, as in the current layered layout
2. compute horizontal band centers from ordered row groups
3. assign each node an initial `y`
4. run a 1D vertical relaxation pass
5. clamp nodes to valid vertical bounds
6. optionally snap to band centers or band gaps when ambiguity is small

Initial `y` rules:

- single membership: place at that band center
- multiple memberships: place at weighted average of relevant centers
- no membership: place in `Unmapped` / neutral band

Vertical relaxation forces:

- band attraction toward weighted row centers
- node-node repulsion to reduce overlap
- edge attraction to connected nodes
- optional equation-order bias for deterministic local stacking

This should remain a constrained 1D problem on `y`, not a full 2D force
layout.

Current implementation note:

- the layout is no longer purely 1D on `y`
- accounting-strip layouts now use deterministic constrained heuristics for:
  - vertical accounting anchoring
  - within-cell spreading
  - proxy ordering
  - soft placement for unmapped and exogenous nodes
  - exogenous barycentric and weighted floating placement

This is still not a free 2D force layout, but it is more than a single 1D
vertical relaxation pass.

## Phase 6: Rendering Changes

Status: implemented

In
[packages/web/src/components/DependencyGraphCanvas.tsx](/home/john/repos/sfcr/packages/web/src/components/DependencyGraphCanvas.tsx):

- add a new `viewMode`, likely `horizontal-strips`
- introduce a dedicated horizontal-strip layout builder
- render bands as horizontal rectangles across the graph body
- move band labels to the left margin or band header area
- keep nodes and edges in the same SVG pipeline as existing views

Recommended UI behavior:

- show primary membership on the node visually
- show secondary memberships in the tooltip
- highlight all relevant bands when hovering an ambiguous node
- show membership provenance and confidence in the tooltip

Avoid trying to encode every membership directly on the node face.

Current implementation note:

- the shipped UI did not add a separate `horizontal-strips` base mode
- instead, `Accounting strips` became a modifier that can be layered onto
  either `Layered DAG` or `Sector strips`
- membership provenance is available in tooltips and diagnostics
- a development-only debug overlay now renders collision boxes, exogenous
  envelopes, barycenter guides, and overlap links

## Phase 7: Notebook Schema Support

Status: partially implemented, simplified

Current dependency cell source shape is defined in
[packages/web/src/notebook/types.ts](/home/john/repos/sfcr/packages/web/src/notebook/types.ts).

This should likely expand to support row-based strip configuration, for
example:

```ts
viewMode?: "layered" | "strips" | "horizontal-strips";
stripMapping?: {
  transactionMatrixCellId?: string;
  balanceMatrixCellId?: string;
  orientation?: "sector-columns" | "matrix-rows";
  includeTransactionRows?: boolean;
  includeBalanceRows?: boolean;
  rowOrder?: "transaction-then-balance" | "balance-then-transaction" | "auto";
}
```

The first pass can keep defaults simple and rely on auto-discovery of the same
matrices the sector-strip mode already uses.

Current implementation note:

- the current UI uses existing dependency-cell view configuration plus runtime
  toggles
- explicit new notebook schema fields for row-orientation were not added
- the implementation instead reuses the existing dependency source and
  auto-discovery path, with accounting strips controlled in the viewer

## Phase 8: BMW-Specific Expectations

Status: implemented and actively used as the primary tuning fixture

BMW is a good first target because it has a compact set of meaningful
accounting rows and a manageable amount of ambiguity.

Expected useful cases:

- `Mh` and `Ms` should span both transaction and balance-sheet interpretations
- `Ld` and `Ls` should span both transaction and balance-sheet interpretations
- `YD` should sit between `Wages` and `Interest on deposits`
- `K` should anchor strongly to `Fixed capital`
- `Balance (net worth)` may remain lightly populated because the current BMW
  equation set does not define `Vh` or `V`

This last point is important: some accounting rows may exist as notebook
reference structure even when the executable model does not contain matching
equation nodes.

## Phase 9: Tests

Status: implemented in part, still expandable

Extend the current tests around dependency strip mapping, especially:

- [packages/web/test/dependencySectors.test.ts](/home/john/repos/sfcr/packages/web/test/dependencySectors.test.ts)

Add tests for:

- row extraction from transaction matrices
- row extraction from balance matrices
- multi-membership for `Mh`, `Ms`, `Ld`, `Ls`
- conservative inferred memberships such as `YD` and `W`
- deterministic row ordering
- deterministic layout output for a fixed graph
- node placement staying within valid vertical bounds

BMW should be the first notebook fixture used for end-to-end validation.

Current implementation note:

- BMW is already used for row-topology tests and dependency-graph diagnostics
- the dependency graph now has regression checks for reusable layout
  diagnostics and overlap metrics
- snapshot-like visual testing is still not used; tests remain geometry and
  diagnostics based

## Phase 10: Rollout Strategy

Status: mostly completed through step 5, with follow-on tuning ongoing

Recommended delivery order:

1. generalize topology from single assignment to weighted membership
2. add row extraction with no UI exposure
3. add horizontal-strip view using explicit memberships only
4. add conservative inference for structurally important unmapped variables
5. tune band ordering, snapping, and hover behavior

This sequence keeps the riskiest part isolated: mapping semantics.

## Main Risks

- users may interpret heuristic placement as canonical accounting truth
- too many weak assignments may make the visualization feel arbitrary
- larger models may produce too many horizontal bands to read comfortably
- unstable force behavior would make the view hard to compare across runs

Mitigations:

- keep layout deterministic
- expose provenance and confidence
- prefer explicit matrix-derived memberships over inferred ones
- start with BMW and other small teaching notebooks before generalizing

## Optional Constrained Annealing Pass

Status: not implemented

If the cheaper routing and placement heuristics stop paying off, add a small
constrained optimization pass rather than a free-form force or annealing
layout.

The preferred first implementation is the narrower intra-sector horizontal
version described in `Preferred Annealing Scope` below. This section should be
read as the general framework and design rationale, not as the default
recommendation for a first optimization pass.

The purpose of this pass is not to redraw the graph from scratch. It should
only improve local separation between:

- edges and node boxes
- edges and other edges
- sibling proxy nodes in crowded cells

while preserving:

- dependency depth / solver ordering
- sector column assignment
- accounting row assignment
- proxy family semantics

### What Must Stay Fixed

Keep these structural anchors fixed:

- sector column assignment
- dependency layer assignment
- accounting row assignment for rigid nodes
- proxy band assignment
- canonical proxy-family grouping

Only optimize small local freedoms:

- `dy` offset inside a row band
- `dx` offset inside a sector/accounting cell
- proxy bundle spacing inside a cell
- edge lane choice
- edge bend / detour amount

### Minimal State Shape

```ts
interface AnnealNodeState {
  id: string;
  anchorX: number;
  anchorY: number;
  dx: number;
  dy: number;
  minDx: number;
  maxDx: number;
  minDy: number;
  maxDy: number;
  rigidity: number;
  cellKey: string;
  canonicalName?: string;
  proxyKind?: "stock" | "change" | "row-expression" | "interest";
}

interface AnnealEdgeState {
  id: string;
  sourceId: string;
  targetId: string;
  lane: number;
  bend: number;
}
```

This is intentionally small. It should sit on top of the deterministic layout
already produced by the canvas code.

### Cost Function

Use a weighted cost function:

```ts
Cost =
  w1 * edgeNodePenalty +
  w2 * edgeEdgePenalty +
  w3 * nodeOverlapPenalty +
  w4 * anchorDeviationPenalty +
  w5 * bundleDisorderPenalty +
  w6 * edgeCurvaturePenalty +
  w7 * proxySeparationPenalty
```

Suggested interpretation:

- `edgeNodePenalty`: penalize edges passing too close to unrelated node boxes
- `edgeEdgePenalty`: penalize crossings and near-crossings between edges
- `nodeOverlapPenalty`: strongly penalize node-node overlap
- `anchorDeviationPenalty`: keep nodes near semantic anchors
- `bundleDisorderPenalty`: keep proxy families in stable order
- `edgeCurvaturePenalty`: discourage excessive bends and lane shifts
- `proxySeparationPenalty`: keep proxy duplicates readable but compact

Suggested starting weights:

```ts
w1 = 100
w2 = 60
w3 = 150
w4 = 8
w5 = 20
w6 = 4
w7 = 25
```

These are only initial tuning values. The priority ordering should remain:

1. avoid collisions
2. preserve semantics
3. improve readability

### Move Set

Keep the move set local and cheap. Example moves:

- move one node slightly up or down within its row-band window
- move one node slightly left or right within its cell
- swap two sibling proxies in the same cell
- change one edge lane by `+1` or `-1`
- change one edge bend amount slightly
- tighten or loosen one proxy bundle

Avoid global free-form moves. The deterministic layout should do the heavy
lifting; the annealing pass should only clean up residual conflicts.

### Acceptance Rule

Use standard simulated annealing acceptance:

```ts
if (deltaCost <= 0) accept
else accept with probability exp(-deltaCost / T)
```

Suggested schedule:

- start with a low temperature because the initial layout is already good
- e.g. `T0 = 8`
- decay with `T *= 0.985`
- stop after roughly `200-600` accepted or attempted moves depending on graph
  size

For BMW-sized diagrams, keep this short and deterministic.

### Determinism

If this pass is implemented, it should still be deterministic:

- fixed seed derived from graph structure
- stable ordering of nodes and edges
- stable initial state from the deterministic layout

Without this, the graph may jump too much between renders, which is harmful to
the notebook’s teaching use case.

### Integration Sequence

If added later, the flow should be:

1. build the current deterministic layout
2. compute cell grouping, proxy families, and edge channels
3. initialize annealing state from that layout
4. run a short constrained optimization pass
5. project the optimized local offsets back into final node and edge geometry

The current implementation should continue to prefer cheaper heuristics first:

- better cell-level lane assignment
- stronger obstacle-aware routing
- local node nudging
- proxy bundle ordering and spacing
- per-band and per-column edge channels

Only after those cheap improvements stop paying off should the annealing pass
be considered.

### Preferred Annealing Scope

If an annealing-style pass is introduced, prefer a narrow intra-sector
horizontal optimization over a broader free-form layout.

Recommended constraint set:

- keep sector assignment fixed
- keep accounting row anchor fixed
- keep proxy band anchor fixed
- keep dependency depth / column identity fixed
- only allow horizontal node motion inside a sector cell
- only allow small edge lane and bend adjustments

This is the recommended first implementation because the remaining readability
problems are usually:

- crowding near the center of a sector
- avoidable edge-node conflicts
- avoidable edge-edge conflicts
- proxy bundles that need cleaner separation

rather than large semantic placement errors.

Suggested annealed state:

```ts
interface AnnealNodeState {
  id: string;
  anchorX: number;
  dx: number;
  minDx: number;
  maxDx: number;
  cellKey: string;
  canonicalName?: string;
  proxyKind?: "stock" | "change" | "row-expression" | "interest";
}

interface AnnealEdgeState {
  id: string;
  lane: number;
  bend: number;
}
```

Suggested reduced cost function:

```ts
Cost =
  w1 * edgeNodePenalty +
  w2 * edgeEdgePenalty +
  w3 * horizontalCrowdingPenalty +
  w4 * anchorDeviationPenalty +
  w5 * bundleOrderPenalty +
  w6 * edgeDetourPenalty
```

Interpretation:

- `edgeNodePenalty`: edges passing too close to node boxes
- `edgeEdgePenalty`: crossings and near-crossings
- `horizontalCrowdingPenalty`: nodes too close together in the same cell
- `anchorDeviationPenalty`: drifting too far from the intended sector center
- `bundleOrderPenalty`: violating stable proxy order such as
  `stock -> change -> interest`
- `edgeDetourPenalty`: excessive lane or bend values

Suggested local move set:

- nudge one node left or right within its cell bounds
- swap two nodes in the same cell
- widen or tighten one proxy bundle
- increment or decrement one edge lane
- increment or decrement one edge bend

This should be understood as:

- constrained intra-sector cleanup

not:

- full graph re-layout

The deterministic sector/accounting layout should remain the primary layout
engine. Any annealing should only improve residual local conflicts. A broader
annealing scope should only be considered if this narrower version fails to
deliver enough improvement.

## Recommendation

Implement this as a row-constrained vertical relaxation mode layered on top of
the current dependency graph pipeline.

Do not replace the existing layered or sector-strip views.

The horizontal-strip view is most valuable as a teaching and navigation tool:

- it should preserve dependency structure
- it should expose accounting semantics
- it should represent ambiguity honestly rather than hiding it
