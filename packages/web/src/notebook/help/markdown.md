Markdown cells hold narrative text inside a notebook. Use them for introductions, assumptions, model notes, section breaks, interpretation of results, and short explanations near charts or tables.

## How To Use

1. Press **Edit** on the markdown cell.
2. Edit the title if needed.
3. Write the body in Markdown.
4. Press **Apply** to save the cell.

Markdown cells do not run the solver. They document the notebook and make the computational cells easier to understand.

## Common Uses

Use markdown cells to explain:

- What the model represents.
- Where the model came from.
- What a scenario changes.
- How to read a chart, table, or matrix.
- Important assumptions or caveats.
- Differences from a source article, R script, spreadsheet, or reference implementation.

Good markdown cells answer the reader's next question before they need to ask it.

## Formatting

Useful Markdown patterns:

```markdown
## Section Heading

A short paragraph with `inline code` for variable names.

- Bullet one
- Bullet two

| Variable | Meaning |
| --- | --- |
| Y | Output |
| Cd | Consumption demand |
```

Use headings sparingly. A notebook is easier to scan when markdown cells have compact sections rather than long walls of text.

## Variable Names

Wrap model variables in backticks, such as `Y`, `Cd`, `Mh`, or `alpha1`. This makes them visually distinct from prose and helps the reader connect the note to equations, charts, and tables.

When explaining an equation, keep the equation short:

`Mh = lag(Mh) + (YD - Cd) * dt`

For longer explanations, split the text into a short equation and a short interpretation.

## Practical Guidance

A good notebook usually has markdown cells before major sections:

- Overview.
- Accounting matrices.
- Model equations.
- Baseline run.
- Scenario runs.
- Result interpretation.

Avoid duplicating every detail from the equations or source data. Markdown should explain why the cell exists and how to interpret it.

## Editing Tips

- Keep the title short and specific.
- Prefer active, direct explanations.
- Use tables for compact variable glossaries.
- Use bullets for assumptions and scenario steps.
- Put long methodological notes near the relevant model section, not at the top of the notebook.

If a note describes a chart or scenario, keep it close to that cell so readers do not need to jump around.
