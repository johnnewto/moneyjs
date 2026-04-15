# Dependency Graph Viewer

## Goal

Add a separate equation dependency viewer without changing the existing
transaction-flow sequence diagram. The sequence diagram remains the
matrix/flow narrative view. The new viewer focuses on equation structure.

## Concepts To Keep Separate

The notebook currently blends three different kinds of ordering:

- notebook equation order
- solver / dependency order
- viewer spatial order

For learning, those should be related but not identical.

## First-Pass Approach

Build a dedicated dependency graph path that:

- extracts `lhs`, current RHS dependencies, lag dependencies, and equation index
- classifies each equation/node with a small educational role taxonomy
- computes stable dependency layers
- sorts nodes within each layer by notebook order
- renders deterministic coordinates in a dedicated canvas

The intended layout rule is:

- primary axis: dependency depth
- secondary axis: notebook order within layer

In practice:

```ts
x = layer * layerGap
y = withinLayerOrder * rowGap
```

## Node Classification

Classification should be first-class model data, not just visual styling.
The initial role set should be:

```ts
type EquationKind =
  | "parameter"
  | "auxiliary"
  | "flow"
  | "stock"
  | "identity"
  | "initial";
```

For the first pass, these roles can be inferred heuristically from existing
equation AST and dependency information:

- `parameter`: no endogenous current dependencies
- `stock`: accumulation / self-lag pattern
- `flow`: directly involved in accumulation structure
- `identity`: algebraic balancing combination
- `auxiliary`: derived variable that does not fit the above
- `initial`: metadata attached to stock nodes rather than a full graph node

Classification should influence both:

- node styling
- layer biasing when multiple placements are otherwise valid

## Why This Shape

This follows the same teaching logic used in classic dynamic-system models:

- parameters / exogenous inputs first
- auxiliaries and flows in the middle
- stocks / accumulation results last

That gives a clearer causal picture than equal spacing or force-directed layout.

## First-Pass Scope

Ship:

- equation dependency graph generation
- layered layout
- stable rendering
- notebook-order intra-layer sorting
- first-class node classification used by layout and styling

Defer:

- split-pane linked interactions
- local reordering on hover
- edge bundling
- multiple layout modes such as notebook / dependency / hybrid

## Expected File Shape

Keep the existing sequence path intact:

- `packages/web/src/notebook/sequence.ts`
- `packages/web/src/components/SequenceDiagramCanvas.tsx`

Add a parallel dependency path:

- `packages/web/src/notebook/dependencyGraph.ts`
- `packages/web/src/components/DependencyGraphCanvas.tsx`

Reuse existing parser and dependency primitives from `packages/core` where
possible instead of introducing a new parser.
