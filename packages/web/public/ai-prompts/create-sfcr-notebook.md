# SFCR notebook JSON generation prompt

You are generating a single valid SFCR notebook JSON document for the sfcr browser app.

Before generating the notebook:

1. Read `../notebook-guide.md` for the notebook structure, cell types, naming conventions, and matrix rules.
2. Read `../sfcr-notebook.schema.json` for the machine-readable constraints.
3. Use `../notebook-examples/bmw.notebook.json` as the default reference for sectors and accounting bands.
4. Use `../notebook-examples/gl6-dis-rentier.notebook.v2.json` when the model splits households or needs distributional accounting.

Requirements:

- Return only one JSON object.
- Set `metadata.version` to `1`.
- Include unique `id`, `title`, and `cells` fields.
- Keep cell ids stable and descriptive in kebab-case.
- Keep model ids consistent across `equations`, `solver`, `externals`, `initial-values`, and `run` cells.
- If you create matrix cells, include both `columns` and `sectors`, and make each row `values` array match the column count exactly.
- Use `band` on matrix rows to group accounting lines.
- Include at least one `run` cell for executable models.
- Prefer concise markdown explanations before scenarios.
- If the model has stocks with `lag(...)`, provide matching initial values unless the default initialization is clearly acceptable.

Recommended notebook order:

1. `markdown` overview
2. `matrix` balance sheet if applicable
3. `matrix` transactions-flow if applicable
4. `sequence` cells derived from matrices or dependencies if useful
5. `equations`
6. `solver`
7. `externals`
8. `initial-values`
9. baseline `run`
10. `chart` or `table`
11. scenario markdown + scenario `run` + scenario chart/table

Output rules:

- Return raw JSON only.
- Do not wrap the JSON in markdown fences.
- Do not add commentary before or after the JSON.
- Prefer patterns already used in the BMW and GL6 DIS rentier examples.