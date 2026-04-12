package io.github.joaomacalos.sfcr.solver;

final class LinearSystemSolver {
    private LinearSystemSolver() {
    }

    static double[] solve(double[][] matrix, double[] rhs) {
        int n = rhs.length;
        double[][] a = new double[n][n];
        double[] b = new double[n];

        for (int i = 0; i < n; i++) {
            System.arraycopy(matrix[i], 0, a[i], 0, n);
            b[i] = rhs[i];
        }

        for (int pivot = 0; pivot < n; pivot++) {
            int maxRow = pivot;
            for (int row = pivot + 1; row < n; row++) {
                if (Math.abs(a[row][pivot]) > Math.abs(a[maxRow][pivot])) {
                    maxRow = row;
                }
            }

            if (Math.abs(a[maxRow][pivot]) < 1e-12) {
                throw new IllegalStateException("Jacobian is singular or near-singular");
            }

            swapRows(a, b, pivot, maxRow);

            double pivotValue = a[pivot][pivot];
            for (int row = pivot + 1; row < n; row++) {
                double factor = a[row][pivot] / pivotValue;
                a[row][pivot] = 0.0;
                for (int col = pivot + 1; col < n; col++) {
                    a[row][col] -= factor * a[pivot][col];
                }
                b[row] -= factor * b[pivot];
            }
        }

        double[] x = new double[n];
        for (int row = n - 1; row >= 0; row--) {
            double sum = b[row];
            for (int col = row + 1; col < n; col++) {
                sum -= a[row][col] * x[col];
            }
            x[row] = sum / a[row][row];
        }

        return x;
    }

    private static void swapRows(double[][] matrix, double[] rhs, int first, int second) {
        if (first == second) {
            return;
        }

        double[] matrixRow = matrix[first];
        matrix[first] = matrix[second];
        matrix[second] = matrixRow;

        double rhsValue = rhs[first];
        rhs[first] = rhs[second];
        rhs[second] = rhsValue;
    }
}
