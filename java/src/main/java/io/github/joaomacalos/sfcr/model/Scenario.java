package io.github.joaomacalos.sfcr.model;

import java.util.List;
import java.util.Objects;

public record Scenario(List<Shock> shocks) {
    public Scenario {
        Objects.requireNonNull(shocks, "shocks");
    }
}
