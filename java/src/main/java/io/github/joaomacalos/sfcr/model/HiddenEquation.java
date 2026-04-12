package io.github.joaomacalos.sfcr.model;

import java.util.Objects;

public record HiddenEquation(String leftVariable, String rightVariable) {
    public HiddenEquation {
        Objects.requireNonNull(leftVariable, "leftVariable");
        Objects.requireNonNull(rightVariable, "rightVariable");
    }
}
