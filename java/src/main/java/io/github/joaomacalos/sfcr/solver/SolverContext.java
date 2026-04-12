package io.github.joaomacalos.sfcr.solver;

public interface SolverContext {
    double currentValue(String variable);

    double lagValue(String variable);

    void setCurrentValue(String variable, double value);

    int maxIterations();

    double tolerance();
}
