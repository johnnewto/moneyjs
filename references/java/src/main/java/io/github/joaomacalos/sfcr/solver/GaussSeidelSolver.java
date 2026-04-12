package io.github.joaomacalos.sfcr.solver;

import io.github.joaomacalos.sfcr.graph.EquationBlock;
import io.github.joaomacalos.sfcr.parser.EvaluationContext;
import io.github.joaomacalos.sfcr.parser.Expression;

import java.util.Map;

public final class GaussSeidelSolver implements BlockSolver {
    @Override
    public void solveBlock(int period, EquationBlock block, Map<String, Expression> expressions, SolverContext context) {
        EvaluationContext evaluationContext = new EvaluationContext() {
            @Override
            public double currentValue(String variable) {
                return context.currentValue(variable);
            }

            @Override
            public double lagValue(String variable) {
                return context.lagValue(variable);
            }
        };

        if (!block.cyclic()) {
            String variable = block.variables().get(0);
            context.setCurrentValue(variable, expressions.get(variable).evaluate(evaluationContext));
            return;
        }

        for (int iteration = 0; iteration < context.maxIterations(); iteration++) {
            boolean converged = true;
            for (String variable : block.variables()) {
                double previous = context.currentValue(variable);
                double next = expressions.get(variable).evaluate(evaluationContext);
                context.setCurrentValue(variable, next);
                double relative = Math.abs(next - previous) / (Math.abs(previous) + 1e-15);
                if (!Double.isFinite(relative) || relative >= context.tolerance()) {
                    converged = false;
                }
            }
            if (converged) {
                return;
            }
        }

        throw new IllegalStateException("Gauss-Seidel algorithm failed to converge for block " + block.variables() + " at period " + period);
    }
}
