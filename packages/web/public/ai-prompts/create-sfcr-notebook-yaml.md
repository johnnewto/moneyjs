# SFCR notebook YAML generation prompt

You are generating a single valid SFCR notebook YAML document for the sfcr browser app.

Before generating the notebook:

1. Read `../notebook-guide.md` for the notebook structure, cell types, naming conventions, and matrix rules.
2. Read `../sfcr-notebook.schema.json` for the machine-readable runtime constraints.
3. Start from `../notebook-examples/starter.example.notebook.yaml` for the minimum valid notebook shape.
4. Use `../notebook-examples/bmw.example.notebook.yaml` as the default reference for sectors and accounting bands.
5. Use `../notebook-examples/gl6-dis-rentier-v2.example.notebook.yaml` when the model splits households or needs distributional accounting.

Requirements:

- Return only one YAML document.
- Set `format` to `sfcr-notebook-yaml` and `formatVersion` to `1`.
- Set `metadata.version` to `1`.
- Include unique `id`, `title`, and notebook content fields.
- Keep cell ids stable and descriptive in kebab-case when explicit cells are needed.
- Prefer compact top-level notebook YAML sections for common content, such as `modelId`, `introCell`, `sectors`, `variables`, `equations`, `balance`, `transactions`, `parameters`, `solver`, `baselineRun`, `charts`, `tables`, and `cells`.
- Use literal block scalars for equation systems, for example `equations: |` followed by one equation per line.
- If you create matrix sections, include both `columns` and `sectors`, and make each row match the column count exactly.
- Include at least one baseline run for executable models.
- Prefer concise markdown explanations before scenarios.
- If the model has stocks with `lag(...)`, provide matching initial values unless the default initialization is clearly acceptable.

Recommended notebook order:

1. Overview / intro cell
2. Balance sheet if applicable
3. Transactions-flow matrix if applicable
4. Sequence cells derived from matrices or dependencies if useful
5. Equations
6. Solver
7. Parameters / externals
8. Initial values
9. Baseline run
10. Chart or table
11. Scenario markdown + scenario run + scenario chart/table

Output rules:

- Return raw YAML only.
- Do not wrap the YAML in markdown fences.
- Do not add commentary before or after the YAML.
- Do not use YAML anchors, aliases, merge keys, or duplicate keys.
- Prefer patterns already used in the BMW and GL6 DIS rentier YAML examples.
