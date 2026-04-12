package io.github.joaomacalos.sfcr.model;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class ModelDefinition {
    private final List<Equation> equations;
    private final Map<String, ExternalSeries> externals;
    private final Map<String, Double> initialValues;

    private ModelDefinition(Builder builder) {
        this.equations = List.copyOf(builder.equations);
        this.externals = Map.copyOf(builder.externals);
        this.initialValues = Map.copyOf(builder.initialValues);
    }

    public static Builder builder() {
        return new Builder();
    }

    public List<Equation> equations() {
        return equations;
    }

    public Map<String, ExternalSeries> externals() {
        return externals;
    }

    public Map<String, Double> initialValues() {
        return initialValues;
    }

    public static final class Builder {
        private final List<Equation> equations = new ArrayList<>();
        private final Map<String, ExternalSeries> externals = new LinkedHashMap<>();
        private final Map<String, Double> initialValues = new LinkedHashMap<>();

        public Builder equation(String name, String expression) {
            equations.add(new Equation(name, expression));
            return this;
        }

        public Builder external(String name, double value) {
            externals.put(name, ExternalSeries.constant(name, value));
            return this;
        }

        public Builder externalSeries(String name, double... values) {
            externals.put(name, ExternalSeries.of(name, values));
            return this;
        }

        public Builder initialValue(String name, double value) {
            initialValues.put(name, value);
            return this;
        }

        public ModelDefinition build() {
            if (equations.isEmpty()) {
                throw new IllegalArgumentException("At least one equation is required");
            }

            Map<String, Integer> seen = new LinkedHashMap<>();
            for (Equation equation : equations) {
                Objects.requireNonNull(equation, "equation");
                seen.merge(equation.name(), 1, Integer::sum);
            }

            List<String> duplicates = seen.entrySet().stream()
                .filter(entry -> entry.getValue() > 1)
                .map(Map.Entry::getKey)
                .toList();

            if (!duplicates.isEmpty()) {
                throw new IllegalArgumentException("Duplicate endogenous variables: " + duplicates);
            }

            for (String external : externals.keySet()) {
                if (seen.containsKey(external)) {
                    throw new IllegalArgumentException("Variable cannot be both endogenous and external: " + external);
                }
            }

            return new ModelDefinition(this);
        }
    }
}
