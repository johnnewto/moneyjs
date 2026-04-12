package io.github.joaomacalos.sfcr.solver;

import io.github.joaomacalos.sfcr.graph.EquationBlock;
import io.github.joaomacalos.sfcr.parser.EvaluationContext;
import io.github.joaomacalos.sfcr.parser.Expression;

import java.util.List;
import java.util.Map;

public final class BroydenSolver implements BlockSolver {
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
        double[] x0 = new double[variables.size()];
        for (int i = 0; i < variables.size(); i++) {
            x0[i] = context.lagValue(variables.get(i));
        }

        setCurrentValues(context, variables, x0);
        double[] g0 = residuals(variables, expressions, evaluationContext);
        double[][] d0 = finiteDifferenceJacobian(variables, expressions, evaluationContext, context, x0, g0);
        double[][] d0Inv = invert(d0);
        double[] delta0 = multiply(d0Inv, negate(g0));
        double[] next = add(x0, delta0);

        if (converged(x0, next, context.tolerance())) {
            setCurrentValues(context, variables, next);
            return;
        }

        double[] current = next;
        double[] currentStep = delta0;
        double[][] currentInv = d0Inv;

        for (int iteration = 1; iteration < context.maxIterations(); iteration++) {
            setCurrentValues(context, variables, current);
            double[] g = residuals(variables, expressions, evaluationContext);
            double[] u = multiply(currentInv, g);
            double denominator = dot(currentStep, add(currentStep, u));

            if (Math.abs(denominator) < 1e-12) {
                double[][] jacobian = finiteDifferenceJacobian(variables, expressions, evaluationContext, context, current, g);
                currentInv = invert(jacobian);
            } else {
                double[][] outer = outerProduct(u, currentStep);
                scaleInPlace(outer, 1.0 / denominator);
                double[][] correction = multiply(outer, currentInv);
                currentInv = subtract(currentInv, correction);
            }

            double[] step = multiply(currentInv, negate(g));
            double[] candidate = add(current, step);

            if (converged(current, candidate, context.tolerance())) {
                setCurrentValues(context, variables, candidate);
                return;
            }

            current = candidate;
            currentStep = step;
        }

        throw new IllegalStateException("Broyden algorithm failed to converge for block " + block.variables() + " at period " + period);
    }

    private double[] residuals(List<String> variables, Map<String, Expression> expressions, EvaluationContext context) {
        double[] residual = new double[variables.size()];
        for (int i = 0; i < variables.size(); i++) {
            String variable = variables.get(i);
            residual[i] = expressions.get(variable).evaluate(context) - context.currentValue(variable);
        }
        return residual;
    }

    private double[][] finiteDifferenceJacobian(
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

    private boolean converged(double[] previous, double[] next, double tolerance) {
        for (int i = 0; i < previous.length; i++) {
            double relative = Math.abs(previous[i] - next[i]) / (Math.abs(next[i]) + 1e-15);
            if (!Double.isFinite(relative) || relative >= tolerance) {
                return false;
            }
        }
        return true;
    }

    private void setCurrentValues(SolverContext context, List<String> variables, double[] values) {
        for (int i = 0; i < variables.size(); i++) {
            context.setCurrentValue(variables.get(i), values[i]);
        }
    }

    private double[] add(double[] left, double[] right) {
        double[] result = new double[left.length];
        for (int i = 0; i < left.length; i++) {
            result[i] = left[i] + right[i];
        }
        return result;
    }

    private double[] negate(double[] values) {
        double[] result = new double[values.length];
        for (int i = 0; i < values.length; i++) {
            result[i] = -values[i];
        }
        return result;
    }

    private double[] multiply(double[][] matrix, double[] vector) {
        double[] result = new double[vector.length];
        for (int row = 0; row < matrix.length; row++) {
            double sum = 0.0;
            for (int col = 0; col < vector.length; col++) {
                sum += matrix[row][col] * vector[col];
            }
            result[row] = sum;
        }
        return result;
    }

    private double[][] multiply(double[][] left, double[][] right) {
        double[][] result = new double[left.length][right[0].length];
        for (int row = 0; row < left.length; row++) {
            for (int col = 0; col < right[0].length; col++) {
                double sum = 0.0;
                for (int i = 0; i < right.length; i++) {
                    sum += left[row][i] * right[i][col];
                }
                result[row][col] = sum;
            }
        }
        return result;
    }

    private double[][] invert(double[][] matrix) {
        int n = matrix.length;
        double[][] inverse = new double[n][n];
        for (int col = 0; col < n; col++) {
            double[] rhs = new double[n];
            rhs[col] = 1.0;
            double[] solution = LinearSystemSolver.solve(matrix, rhs);
            for (int row = 0; row < n; row++) {
                inverse[row][col] = solution[row];
            }
        }
        return inverse;
    }

    private double[][] outerProduct(double[] left, double[] right) {
        double[][] result = new double[left.length][right.length];
        for (int row = 0; row < left.length; row++) {
            for (int col = 0; col < right.length; col++) {
                result[row][col] = left[row] * right[col];
            }
        }
        return result;
    }

    private void scaleInPlace(double[][] matrix, double scalar) {
        for (int row = 0; row < matrix.length; row++) {
            for (int col = 0; col < matrix[row].length; col++) {
                matrix[row][col] *= scalar;
            }
        }
    }

    private double[][] subtract(double[][] left, double[][] right) {
        double[][] result = new double[left.length][left[0].length];
        for (int row = 0; row < left.length; row++) {
            for (int col = 0; col < left[row].length; col++) {
                result[row][col] = left[row][col] - right[row][col];
            }
        }
        return result;
    }

    private double dot(double[] left, double[] right) {
        double sum = 0.0;
        for (int i = 0; i < left.length; i++) {
            sum += left[i] * right[i];
        }
        return sum;
    }
}
