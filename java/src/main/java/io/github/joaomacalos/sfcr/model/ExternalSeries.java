package io.github.joaomacalos.sfcr.model;

import java.util.Arrays;
import java.util.Objects;

public final class ExternalSeries {
    private final String name;
    private final double[] values;

    private ExternalSeries(String name, double[] values) {
        this.name = Objects.requireNonNull(name, "name");
        this.values = Objects.requireNonNull(values, "values");
    }

    public static ExternalSeries constant(String name, double value) {
        return new ExternalSeries(name, new double[] {value});
    }

    public static ExternalSeries of(String name, double... values) {
        if (values.length == 0) {
            throw new IllegalArgumentException("values must not be empty");
        }
        return new ExternalSeries(name, Arrays.copyOf(values, values.length));
    }

    public String name() {
        return name;
    }

    public double valueAt(int period) {
        if (values.length == 1) {
            return values[0];
        }
        if (period < 0 || period >= values.length) {
            throw new IllegalArgumentException("No external value for period " + period + " in " + name);
        }
        return values[period];
    }
}
