# Notebook Render Profiling

## Goal

Provide a low-friction way to measure notebook render and mount cost before
changing notebook behavior.

The current instrumentation is intended to answer two questions:

- is notebook work dominated by broad rerenders or by a few expensive cells
- which cell types are expensive enough to justify deferred mounting

This should be used before introducing cell virtualization or off-screen
deferred mounting.

## Current Implementation

The profiling path lives in:

- [packages/web/src/notebook/notebookProfiler.tsx](/home/john/repos/sfcr/packages/web/src/notebook/notebookProfiler.tsx)
- [packages/web/src/notebook/NotebookApp.tsx](/home/john/repos/sfcr/packages/web/src/notebook/NotebookApp.tsx)
- [packages/web/src/notebook/NotebookCellView.tsx](/home/john/repos/sfcr/packages/web/src/notebook/NotebookCellView.tsx)

The implementation uses React `Profiler` boundaries and is gated so it stays
inactive unless explicitly enabled in a development build.

When enabled, it records render events into a browser-global store instead of
spamming the console on every commit.

## Enable The Profiler

The profiler is development-only.

In the browser devtools console:

```js
localStorage.setItem("sfcr:notebook-profiler", "1");
```

Then reload the notebook route.

To disable it again:

```js
localStorage.removeItem("sfcr:notebook-profiler");
```

## What Gets Measured

There are currently three profiling levels.

### Notebook App

The top-level notebook app boundary measures the whole notebook surface and
records metadata such as:

- active rail tab
- notebook cell count
- whether a linked editor is active
- selected period index

This is the broad signal for whether notebook-level state changes still cause
too much work.

### Notebook Canvas

The canvas boundary measures the cell-mapping region inside the notebook body.

This is the most useful place to check period-slider interactions, because it
captures the render path that maps the notebook cells into `NotebookCellView`
instances.

### Notebook Cell View

Each cell boundary measures one `NotebookCellView` instance and records:

- cell id
- cell type
- collapsed state
- selected state

This is the main signal for identifying which cell classes are expensive to
mount or update.

## Reading The Results

When profiling is enabled, the browser exposes:

```js
window.__sfcrNotebookProfiler
```

Useful commands:

```js
window.__sfcrNotebookProfiler.printSummary();
window.__sfcrNotebookProfiler.printRecent();
window.__sfcrNotebookProfiler.clear();
```

`printSummary()` groups events by profiler id, phase, and metadata, then sorts
the groups by total actual duration.

The most useful columns are:

- `id`: which boundary produced the timing
- `phase`: `mount`, `update`, or `nested-update`
- `count`: how often that boundary committed
- `totalActualDuration`: total time spent across those commits
- `averageActualDuration`: typical cost per commit
- `maxActualDuration`: worst single commit in the group
- `metadata`: the cell or notebook context attached to the event

`printRecent()` is useful when reproducing a single interaction such as moving
the period scrubber one step.

## Suggested Profiling Scenarios

Run `clear()` between scenarios so the summary stays easy to read.

### Initial notebook load

Use this to find heavy mount cost.

Questions to ask:

- is `NotebookApp` mount time high
- is `NotebookCanvas` mount time high
- which `NotebookCellView` cell types dominate mount totals

If a few heavy cell types dominate mount cost, they are the best candidates for
deferred mounting.

### Period scrubber movement

Use this to verify whether period selection still causes too much render work.

Questions to ask:

- does `NotebookCanvas` show large update totals
- are updates concentrated in period-sensitive cells only
- do unexpected cell types still appear in update-heavy groups

After the memoization change in
[packages/web/src/notebook/NotebookCellView.tsx](/home/john/repos/sfcr/packages/web/src/notebook/NotebookCellView.tsx),
period-slider updates should be narrower than before.

### Expanding or editing a cell

Use this to understand linked-editor and per-cell interaction cost.

Questions to ask:

- does one cell type dominate updates when entering edit mode
- do unrelated cells also update
- does selection or active-editor state still fan out too broadly

## How To Interpret The Output

Use the profiler to separate three different cases.

### Case 1: Broad update problem

Symptoms:

- `NotebookCanvas` update totals are high
- many `NotebookCellView` groups show updates for one interaction

Interpretation:

- state changes are still invalidating too much of the render tree

Likely next step:

- narrow prop churn or add more memo boundaries before changing mount policy

### Case 2: Heavy cell mount problem

Symptoms:

- initial load is slow
- a few `NotebookCellView` types dominate mount totals

Interpretation:

- the main cost is mounting heavy off-screen cell bodies rather than broad
  rerendering

Likely next step:

- prototype deferred mounting for those heavy cell types only

### Case 3: Localized expensive subtree

Symptoms:

- one cell type is consistently expensive even when updates are scoped well

Interpretation:

- the expensive work is inside that cell type rather than in notebook-wide
  mapping

Likely next step:

- add a second profiler layer inside that cell type before redesigning the
  notebook list behavior

## Why This Comes Before Deferred Mounting

Deferred mounting helps when expensive cell bodies are mounted below the fold.
It does not help much if the real problem is broad prop invalidation or a small
number of always-visible heavy views.

Profiling first keeps the next performance change evidence-based.

That matters because deferred mounting adds real complexity:

- visibility tracking
- placeholder behavior
- height preservation
- edit-state exceptions
- scroll-target stability requirements

If profiling shows that only a few heavy cell types dominate mount cost, then
that complexity is easier to justify and easier to scope.

## Current Limits

This profiler is intentionally lightweight.

It does not try to measure:

- browser paint cost directly
- layout thrash outside the React commit path
- memory pressure from mounted canvases or charts
- network or solver execution time

It is best used as a first pass for React render cost, then combined with the
browser performance panel if deeper investigation is needed.

## Recommended Next Step After Profiling

If the summary shows that `chart`, `matrix`, `sequence`, or similarly heavy
cell types dominate mount cost, prefer a narrow deferred-mount prototype:

- keep the outer notebook cell shell mounted
- defer heavy inner content for far-off-screen cells
- never defer the selected cell or active editor cell
- preserve measured heights so scroll targets stay stable

That gives most of the benefit of virtualization with less architectural risk.