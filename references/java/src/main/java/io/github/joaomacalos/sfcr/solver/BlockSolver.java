package io.github.joaomacalos.sfcr.solver;

import io.github.joaomacalos.sfcr.graph.EquationBlock;
import io.github.joaomacalos.sfcr.parser.Expression;

import java.util.Map;

public interface BlockSolver {
    void solveBlock(int period, EquationBlock block, Map<String, Expression> expressions, SolverContext context);
}
