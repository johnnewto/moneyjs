package io.github.joaomacalos.sfcr.engine;

import io.github.joaomacalos.sfcr.graph.DependencyGraphAnalyzer;
import io.github.joaomacalos.sfcr.graph.EquationBlock;
import io.github.joaomacalos.sfcr.model.Equation;
import io.github.joaomacalos.sfcr.model.ExternalSeries;
import io.github.joaomacalos.sfcr.model.HiddenEquation;
import io.github.joaomacalos.sfcr.model.ModelDefinition;
import io.github.joaomacalos.sfcr.model.Scenario;
import io.github.joaomacalos.sfcr.model.Shock;
import io.github.joaomacalos.sfcr.model.SimulationOptions;
import io.github.joaomacalos.sfcr.model.SolverMethod;
import io.github.joaomacalos.sfcr.parser.Expression;
import io.github.joaomacalos.sfcr.parser.ExpressionParser;
import io.github.joaomacalos.sfcr.result.SimulationResult;
import io.github.joaomacalos.sfcr.solver.BroydenSolver;
import io.github.joaomacalos.sfcr.solver.BlockSolver;
import io.github.joaomacalos.sfcr.solver.GaussSeidelSolver;
import io.github.joaomacalos.sfcr.solver.NewtonRaphsonSolver;
import io.github.joaomacalos.sfcr.solver.SolverContext;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SfcrEngine {
    private final ExpressionParser parser = new ExpressionParser();
    private final DependencyGraphAnalyzer graphAnalyzer = new DependencyGraphAnalyzer();

    public SimulationResult runBaseline(ModelDefinition model, SimulationOptions options) {
        Map<String, Expression> parsed = parseEquations(model.equations());
        List<EquationBlock> orderedBlocks = graphAnalyzer.orderedBlocks(model.equations(), parsed);
        Map<String, double[]> series = initializeSeries(model, options);
        runSimulation(options, parsed, orderedBlocks, series);

        validateHiddenEquation(series, options);

        return new SimulationResult(series, orderedBlocks, model, options);
    }

    public SimulationResult runScenario(SimulationResult baseline, Scenario scenario, SimulationOptions options) {
        ModelDefinition model = baseline.model();
        Map<String, Expression> parsed = parseEquations(model.equations());
        List<EquationBlock> orderedBlocks = graphAnalyzer.orderedBlocks(model.equations(), parsed);
        Map<String, double[]> series = initializeScenarioSeries(baseline, model, scenario, options);
        runSimulation(options, parsed, orderedBlocks, series);
        validateHiddenEquation(series, options);
        return new SimulationResult(series, orderedBlocks, model, options);
    }

    private Map<String, Expression> parseEquations(List<Equation> equations) {
        Map<String, Expression> parsed = new LinkedHashMap<>();
        for (Equation equation : equations) {
            parsed.put(equation.name(), parser.parse(equation.expression()));
        }
        return parsed;
    }

    private Map<String, double[]> initializeSeries(ModelDefinition model, SimulationOptions options) {
        Map<String, double[]> series = new LinkedHashMap<>();

        for (Equation equation : model.equations()) {
            double[] values = new double[options.periods()];
            for (int i = 0; i < values.length; i++) {
                values[i] = options.defaultInitialValue();
            }
            series.put(equation.name(), values);
        }

        for (ExternalSeries external : model.externals().values()) {
            double[] values = new double[options.periods()];
            for (int period = 0; period < options.periods(); period++) {
                values[period] = external.valueAt(period);
            }
            series.put(external.name(), values);
        }

        for (double[] values : series.values()) {
            values[0] = options.defaultInitialValue();
        }

        for (Map.Entry<String, Double> entry : model.initialValues().entrySet()) {
            double[] values = series.get(entry.getKey());
            if (values != null) {
                values[0] = entry.getValue();
            }
        }

        return series;
    }

    private Map<String, double[]> initializeScenarioSeries(
        SimulationResult baseline,
        ModelDefinition model,
        Scenario scenario,
        SimulationOptions options
    ) {
        Map<String, double[]> series = new LinkedHashMap<>();

        for (Equation equation : model.equations()) {
            double[] values = new double[options.periods()];
            double steady = baseline.lastValue(equation.name());
            for (int period = 0; period < options.periods(); period++) {
                values[period] = steady;
            }
            series.put(equation.name(), values);
        }

        for (ExternalSeries external : model.externals().values()) {
            double[] values = new double[options.periods()];
            double steady = baseline.lastValue(external.name());
            for (int period = 0; period < options.periods(); period++) {
                values[period] = steady;
            }
            for (int period = 0; period < options.periods(); period++) {
                values[period] = external.valueAt(period);
            }
            values[0] = steady;
            series.put(external.name(), values);
        }

        for (Shock shock : scenario.shocks()) {
            validateShock(model, shock, options.periods());
            int shockLength = shock.endPeriodInclusive() - shock.startPeriodInclusive() + 1;
            for (Map.Entry<String, ExternalSeries> entry : shock.variables().entrySet()) {
                double[] values = series.get(entry.getKey());
                for (int period = shock.startPeriodInclusive(); period <= shock.endPeriodInclusive(); period++) {
                    int shockPeriod = period - shock.startPeriodInclusive();
                    values[period - 1] = shockValue(entry.getValue(), shockPeriod, shockLength);
                }
            }
        }

        return series;
    }

    private double shockValue(ExternalSeries series, int shockPeriod, int shockLength) {
        try {
            return series.valueAt(shockPeriod);
        } catch (IllegalArgumentException ignored) {
            if (shockLength > 1) {
                throw ignored;
            }
            return series.valueAt(0);
        }
    }

    private void runSimulation(
        SimulationOptions options,
        Map<String, Expression> parsed,
        List<EquationBlock> orderedBlocks,
        Map<String, double[]> series
    ) {
        BlockSolver solver = selectSolver(options.solverMethod());
        for (int period = 1; period < options.periods(); period++) {
            for (EquationBlock block : orderedBlocks) {
                SolverContext context = new MatrixBackedSolverContext(series, period, options);
                solver.solveBlock(period, block, parsed, context);
            }
        }
    }

    private BlockSolver selectSolver(SolverMethod solverMethod) {
        return switch (solverMethod) {
            case GAUSS_SEIDEL -> new GaussSeidelSolver();
            case NEWTON -> new NewtonRaphsonSolver();
            case BROYDEN -> new BroydenSolver();
        };
    }

    private void validateHiddenEquation(Map<String, double[]> series, SimulationOptions options) {
        HiddenEquation hiddenEquation = options.hiddenEquation();
        if (hiddenEquation == null) {
            return;
        }

        double[] left = series.get(hiddenEquation.leftVariable());
        double[] right = series.get(hiddenEquation.rightVariable());
        if (left == null || right == null) {
            throw new IllegalArgumentException("Hidden equation variables must exist in the model");
        }

        for (int period = 0; period < options.periods(); period++) {
            double discrepancy = Math.abs(left[period] - right[period]);
            boolean valid;
            if (options.relativeHiddenTolerance()) {
                valid = discrepancy / (Math.abs(left[period]) + 1e-15) < options.hiddenTolerance();
            } else {
                valid = discrepancy < options.hiddenTolerance();
            }
            if (!valid) {
                throw new IllegalStateException(
                    "Hidden equation is not fulfilled at period " + (period + 1) +
                        " for " + hiddenEquation.leftVariable() + " and " + hiddenEquation.rightVariable()
                );
            }
        }
    }

    private void validateShock(ModelDefinition model, Shock shock, int periods) {
        if (shock.startPeriodInclusive() < 1) {
            throw new IllegalArgumentException("Shock start period must be at least 1");
        }
        if (shock.endPeriodInclusive() > periods) {
            throw new IllegalArgumentException("Shock end period must be <= scenario periods");
        }

        for (String variable : shock.variables().keySet()) {
            if (!model.externals().containsKey(variable)) {
                throw new IllegalArgumentException("Shocked variable is not an external variable: " + variable);
            }
        }
    }

    private static final class MatrixBackedSolverContext implements SolverContext {
        private final Map<String, double[]> series;
        private final int period;
        private final SimulationOptions options;

        private MatrixBackedSolverContext(Map<String, double[]> series, int period, SimulationOptions options) {
            this.series = series;
            this.period = period;
            this.options = options;
        }

        @Override
        public double currentValue(String variable) {
            double[] values = requireSeries(variable);
            return values[period];
        }

        @Override
        public double lagValue(String variable) {
            double[] values = requireSeries(variable);
            return values[period - 1];
        }

        @Override
        public void setCurrentValue(String variable, double value) {
            double[] values = requireSeries(variable);
            values[period] = value;
        }

        @Override
        public int maxIterations() {
            return options.maxIterations();
        }

        @Override
        public double tolerance() {
            return options.tolerance();
        }

        private double[] requireSeries(String variable) {
            double[] values = series.get(variable);
            if (values == null) {
                throw new IllegalArgumentException("Unknown variable: " + variable);
            }
            return values;
        }
    }
}
