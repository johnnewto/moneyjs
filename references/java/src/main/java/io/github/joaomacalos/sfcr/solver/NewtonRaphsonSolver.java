package io.github.joaomacalos.sfcr.solver;

import io.github.joaomacalos.sfcr.graph.EquationBlock;
import io.github.joaomacalos.sfcr.parser.EvaluationContext;
import io.github.joaomacalos.sfcr.parser.Expression;

import java.util.List;
import java.util.Map;

public final class NewtonRaphsonSolver implements BlockSolver {
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

        List<String> variables = block.variables();
        double[] x = new double[variables.size()];
        for (int i = 0; i < variables.size(); i++) {
            x[i] = context.lagValue(variables.get(i));
        }

        for (int iteration = 0; iteration < context.maxIterations(); iteration++) {
            setCurrentValues(context, variables, x);
            double[] residual = residuals(variables, expressions, evaluationContext);

            if (maxAbs(residual) < context.tolerance()) {
                return;
            }

            double[][] jacobian = jacobian(variables, expressions, evaluationContext, context, x, residual);
            double[] negativeResidual = new double[residual.length];
            for (int i = 0; i < residual.length; i++) {
                negativeResidual[i] = -residual[i];
            }

            double[] delta = LinearSystemSolver.solve(jacobian, negativeResidual);
            double maxRelative = 0.0;
            for (int i = 0; i < x.length; i++) {
                x[i] += delta[i];
                double relative = Math.abs(delta[i]) / (Math.abs(x[i]) + 1e-15);
                maxRelative = Math.max(maxRelative, relative);
            }

            setCurrentValues(context, variables, x);
            if (maxRelative < context.tolerance()) {
                return;
            }
        }

        throw new IllegalStateException("Newton-Raphson algorithm failed to converge for block " + block.variables() + " at period " + period);
    }

    private double[] residuals(List<String> variables, Map<String, Expression> expressions, EvaluationContext context) {
        double[] residual = new double[variables.size()];
        for (int i = 0; i < variables.size(); i++) {
            String variable = variables.get(i);
            residual[i] = expressions.get(variable).evaluate(context) - context.currentValue(variable);
        }
        return residual;
    }

    private double[][] jacobian(
        List<String> variables,
        Map<String, Expression> expressions,
        EvaluationContext evaluationContext,
        SolverContext context,
        double[] x,
        double[] baseResidual
    ) {
        double[][] jacobian = new double[variables.size()][variables.size()];

        for (int col = 0; col < variables.size(); col++) {
            double[] shifted = x.clone();
            double step = 1e-7 * Math.max(1.0, Math.abs(shifted[col]));
            shifted[col] += step;
            setCurrentValues(context, variables, shifted);
            double[] shiftedResidual = residuals(variables, expressions, evaluationContext);

            for (int row = 0; row < variables.size(); row++) {
                jacobian[row][col] = (shiftedResidual[row] - baseResidual[row]) / step;
            }
        }

        setCurrentValues(context, variables, x);
        return jacobian;
    }

    private void setCurrentValues(SolverContext context, List<String> variables, double[] x) {
        for (int i = 0; i < variables.size(); i++) {
            context.setCurrentValue(variables.get(i), x[i]);
        }
    }

    private double maxAbs(double[] values) {
        double max = 0.0;
        for (double value : values) {
            max = Math.max(max, Math.abs(value));
        }
        return max;
    }
}
