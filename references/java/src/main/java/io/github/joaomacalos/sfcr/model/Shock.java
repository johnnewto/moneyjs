package io.github.joaomacalos.sfcr.model;

import java.util.Map;
import java.util.Objects;

public record Shock(Map<String, ExternalSeries> variables, int startPeriodInclusive, int endPeriodInclusive) {
    public Shock {
        Objects.requireNonNull(variables, "variables");
        if (startPeriodInclusive < 0) {
            throw new IllegalArgumentException("startPeriodInclusive must be non-negative");
        }
        if (endPeriodInclusive < startPeriodInclusive) {
            throw new IllegalArgumentException("endPeriodInclusive must be >= startPeriodInclusive");
        }
    }
}
