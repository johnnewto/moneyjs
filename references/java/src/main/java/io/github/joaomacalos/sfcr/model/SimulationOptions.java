package io.github.joaomacalos.sfcr.model;

import java.util.Objects;

public final class SimulationOptions {
    private final int periods;
    private final int maxIterations;
    private final double tolerance;
    private final SolverMethod solverMethod;
    private final double defaultInitialValue;
    private final HiddenEquation hiddenEquation;
    private final double hiddenTolerance;
    private final boolean relativeHiddenTolerance;

    private SimulationOptions(Builder builder) {
        this.periods = builder.periods;
        this.maxIterations = builder.maxIterations;
        this.tolerance = builder.tolerance;
        this.solverMethod = builder.solverMethod;
        this.defaultInitialValue = builder.defaultInitialValue;
        this.hiddenEquation = builder.hiddenEquation;
        this.hiddenTolerance = builder.hiddenTolerance;
        this.relativeHiddenTolerance = builder.relativeHiddenTolerance;
    }

    public static Builder builder() {
        return new Builder();
    }

    public int periods() {
        return periods;
    }

    public int maxIterations() {
        return maxIterations;
    }

    public double tolerance() {
        return tolerance;
    }

    public SolverMethod solverMethod() {
        return solverMethod;
    }

    public double defaultInitialValue() {
        return defaultInitialValue;
    }

    public HiddenEquation hiddenEquation() {
        return hiddenEquation;
    }

    public double hiddenTolerance() {
        return hiddenTolerance;
    }

    public boolean relativeHiddenTolerance() {
        return relativeHiddenTolerance;
    }

    public static final class Builder {
        private int periods = 60;
        private int maxIterations = 350;
        private double tolerance = 1e-8;
        private SolverMethod solverMethod = SolverMethod.GAUSS_SEIDEL;
        private double defaultInitialValue = 1e-15;
        private HiddenEquation hiddenEquation;
        private double hiddenTolerance = 0.1;
        private boolean relativeHiddenTolerance;

        public Builder periods(int periods) {
            this.periods = periods;
            return this;
        }

        public Builder maxIterations(int maxIterations) {
            this.maxIterations = maxIterations;
            return this;
        }

        public Builder tolerance(double tolerance) {
            this.tolerance = tolerance;
            return this;
        }

        public Builder solverMethod(SolverMethod solverMethod) {
            this.solverMethod = Objects.requireNonNull(solverMethod, "solverMethod");
            return this;
        }

        public Builder defaultInitialValue(double defaultInitialValue) {
            this.defaultInitialValue = defaultInitialValue;
            return this;
        }

        public Builder hiddenEquation(String leftVariable, String rightVariable) {
            this.hiddenEquation = new HiddenEquation(leftVariable, rightVariable);
            return this;
        }

        public Builder hiddenTolerance(double hiddenTolerance) {
            this.hiddenTolerance = hiddenTolerance;
            return this;
        }

        public Builder relativeHiddenTolerance(boolean relativeHiddenTolerance) {
            this.relativeHiddenTolerance = relativeHiddenTolerance;
            return this;
        }

        public SimulationOptions build() {
            if (periods < 2) {
                throw new IllegalArgumentException("periods must be at least 2");
            }
            if (maxIterations < 1) {
                throw new IllegalArgumentException("maxIterations must be positive");
            }
            if (tolerance <= 0) {
                throw new IllegalArgumentException("tolerance must be positive");
            }
            if (hiddenTolerance <= 0) {
                throw new IllegalArgumentException("hiddenTolerance must be positive");
            }
            return new SimulationOptions(this);
        }
    }
}
