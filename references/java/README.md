# sfcr Java Skeleton

This directory contains a Java-first rewrite scaffold for the `sfcr` package.

It is intentionally separate from the R package so migration work can proceed without disturbing the current codebase.

Current scope:

- Java-native model definition API
- Expression parsing for arithmetic, variables, `lag(x)`, and `diff(x)`
- Dependency graph analysis with strongly connected component ordering
- Baseline simulation with a Gauss-Seidel solver
- Scenario/shock/result abstractions as placeholders for the next migration steps

Build notes:

- `build.gradle.kts` and `settings.gradle.kts` are included for a standard JVM layout.
- This environment does not have Gradle installed, so verification in this repo is done with `javac` and `java`.

Manual compile/run:

```bash
javac $(find src/main/java src/test/java -name '*.java')
java -ea -cp src/main/java:src/test/java io.github.joaomacalos.sfcr.SmokeTest
java -cp src/main/java io.github.joaomacalos.sfcr.example.ExampleMain
```
