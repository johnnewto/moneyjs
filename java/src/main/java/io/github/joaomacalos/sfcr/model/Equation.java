package io.github.joaomacalos.sfcr.model;

import java.util.Objects;

public record Equation(String name, String expression) {
    public Equation {
        Objects.requireNonNull(name, "name");
        Objects.requireNonNull(expression, "expression");
    }
}
