package io.github.joaomacalos.sfcr.graph;

import java.util.List;

public record EquationBlock(List<String> variables) {
    public boolean cyclic() {
        return variables.size() > 1;
    }
}
