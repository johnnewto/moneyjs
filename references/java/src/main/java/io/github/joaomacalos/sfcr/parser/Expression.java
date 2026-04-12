package io.github.joaomacalos.sfcr.parser;

import java.util.Set;

public interface Expression {
    double evaluate(EvaluationContext context);

    Set<String> currentDependencies();
}
