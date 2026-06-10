# References

This directory holds non-primary implementations that are kept for verification, parity checks, and migration support.

Current contents:

- `java/`: Java reference engine used when validating or porting behavior into the TypeScript solver
- `r-sfcr/`: upstream R implementation pinned as a git submodule for parity and behavior checks
- `keynote_speech_Florence/`: Marco Veronese Passarella's ECO-3IO-PC prototype (IO + SFC + ecological block) from the Florence 2025 summer school keynote

Regression checkpoints for notebook templates (including Florence baseline numbers) are documented in [`devdocs/r-regression-fixtures.md`](../devdocs/r-regression-fixtures.md).

If the submodule has not been fetched yet, run:

```bash
git submodule update --init --recursive
```

These projects are not the default entry point for new product work.
