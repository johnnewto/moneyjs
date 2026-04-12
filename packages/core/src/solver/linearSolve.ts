export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row) => [...row]);
  const b = [...rhs];

  for (let pivot = 0; pivot < n; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(a[row]?.[pivot] ?? 0) > Math.abs(a[maxRow]?.[pivot] ?? 0)) {
        maxRow = row;
      }
    }

    if (Math.abs(a[maxRow]?.[pivot] ?? 0) < 1e-12) {
      throw new Error("Jacobian is singular or near-singular");
    }

    swapRows(a, b, pivot, maxRow);

    const pivotValue = a[pivot]?.[pivot] ?? 0;
    for (let row = pivot + 1; row < n; row += 1) {
      const factor = (a[row]?.[pivot] ?? 0) / pivotValue;
      if (a[row]) {
        a[row][pivot] = 0;
      }
      for (let col = pivot + 1; col < n; col += 1) {
        if (a[row] && a[pivot]) {
          a[row][col] -= factor * (a[pivot][col] ?? 0);
        }
      }
      b[row] = (b[row] ?? 0) - factor * (b[pivot] ?? 0);
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row] ?? 0;
    for (let col = row + 1; col < n; col += 1) {
      sum -= (a[row]?.[col] ?? 0) * (x[col] ?? 0);
    }
    x[row] = sum / (a[row]?.[row] ?? NaN);
  }

  return x;
}

function swapRows(matrix: number[][], rhs: number[], first: number, second: number): void {
  if (first === second) {
    return;
  }

  [matrix[first], matrix[second]] = [matrix[second] ?? [], matrix[first] ?? []];
  [rhs[first], rhs[second]] = [rhs[second] ?? 0, rhs[first] ?? 0];
}
