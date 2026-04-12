package io.github.joaomacalos.sfcr.parser;

public interface EvaluationContext {
    double currentValue(String variable);

    double lagValue(String variable);
}
