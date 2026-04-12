package io.github.joaomacalos.sfcr.result;

import io.github.joaomacalos.sfcr.graph.EquationBlock;
import io.github.joaomacalos.sfcr.model.ModelDefinition;
import io.github.joaomacalos.sfcr.model.SimulationOptions;

import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class SimulationResult {
    private final Map<String, double[]> series;
    private final List<EquationBlock> blocks;
    private final ModelDefinition model;
    private final SimulationOptions options;

    public SimulationResult(Map<String, double[]> series, List<EquationBlock> blocks, ModelDefinition model, SimulationOptions options) {
        this.series = Objects.requireNonNull(series, "series");
        this.blocks = Objects.requireNonNull(blocks, "blocks");
        this.model = Objects.requireNonNull(model, "model");
        this.options = Objects.requireNonNull(options, "options");
    }

    public double value(String variable, int period) {
        double[] values = series.get(variable);
        if (values == null) {
            throw new IllegalArgumentException("Unknown variable: " + variable);
        }
        return values[period];
    }

    public double[] series(String variable) {
        double[] values = series.get(variable);
        if (values == null) {
            throw new IllegalArgumentException("Unknown variable: " + variable);
        }
        return values.clone();
    }

    public List<EquationBlock> blocks() {
        return blocks;
    }

    public Map<String, double[]> allSeries() {
        return series;
    }

    public ModelDefinition model() {
        return model;
    }

    public SimulationOptions options() {
        return options;
    }

    public double lastValue(String variable) {
        double[] values = series(variable);
        return values[values.length - 1];
    }
}
