# References

This directory holds non-primary implementations that are kept for verification, parity checks, and migration support.

Current contents:

- `java/`: Java reference engine used when validating or porting behavior into the TypeScript solver
- `r-sfcr/`: upstream R implementation pinned as a git submodule for parity and behavior checks

If the submodule has not been fetched yet, run:

```bash
git submodule update --init --recursive
```

These projects are not the default entry point for new product work.
