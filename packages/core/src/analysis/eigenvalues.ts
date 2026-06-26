export interface ComplexValue {
  re: number;
  im: number;
}

export interface Eigenvalue extends ComplexValue {
  abs: number;
}

export interface EigenpairResult {
  eigenvalue: Eigenvalue;
  eigenvector: ComplexValue[];
  eigenpairResidualNorm: number;
  eigenpairResidualRelative: number;
  reliable: boolean;
}

const DEFAULT_EIGENPAIR_RESIDUAL_TOLERANCE = 1e-6;

export function eigenvaluesOfMatrix(matrix: number[][]): Eigenvalue[] {
  const n = matrix.length;
  if (n === 0) {
    return [];
  }

  if (n === 1) {
    const value = matrix[0]?.[0] ?? 0;
    return [toEigenvalue(value, 0)];
  }

  if (n === 2) {
    return eigenvaluesOf2x2(
      matrix[0]?.[0] ?? 0,
      matrix[0]?.[1] ?? 0,
      matrix[1]?.[0] ?? 0,
      matrix[1]?.[1] ?? 0
    );
  }

  const hessenberg = toUpperHessenberg(cloneMatrix(matrix));
  const schur = francisQrIteration(hessenberg);
  return extractEigenvaluesFromSchur(schur);
}

export function computeEigenpair(
  matrix: number[][],
  eigenvalue: Eigenvalue,
  options?: {
    seedIndex?: number;
    tolerance?: number;
    residualTolerance?: number;
  }
): EigenpairResult {
  const n = matrix.length;
  const tolerance = options?.tolerance ?? 1e-10;
  const residualTolerance = options?.residualTolerance ?? DEFAULT_EIGENPAIR_RESIDUAL_TOLERANCE;

  if (n === 0) {
    return emptyEigenpairResult(eigenvalue);
  }

  if (n === 1) {
    const vector = [{ re: 1, im: 0 }];
    return finalizeEigenpair(matrix, eigenvalue, vector, residualTolerance);
  }

  const seedIndex = options?.seedIndex ?? 0;
  const candidates: ComplexValue[][] = [];

  if (Math.abs(eigenvalue.im) <= tolerance) {
    candidates.push(
      inverseIterationReal(matrix, eigenvalue.re, seedIndex % n, tolerance),
      inverseIterationReal(matrix, eigenvalue.re, (seedIndex + 1) % n, tolerance),
      inverseIterationReal(matrix, eigenvalue.re, (seedIndex + 7) % n, tolerance)
    );
  } else {
    candidates.push(
      inverseIterationComplex(matrix, eigenvalue, seedIndex % n, tolerance),
      inverseIterationComplex(matrix, eigenvalue, (seedIndex + 1) % n, tolerance)
    );
  }

  let best: EigenpairResult | null = null;
  for (const candidate of candidates) {
    const result = finalizeEigenpair(matrix, eigenvalue, candidate, residualTolerance);
    if (!best || result.eigenpairResidualRelative < best.eigenpairResidualRelative) {
      best = result;
    }
  }

  return best ?? emptyEigenpairResult(eigenvalue);
}

function finalizeEigenpair(
  matrix: number[][],
  eigenvalue: Eigenvalue,
  eigenvector: ComplexValue[],
  residualTolerance: number
): EigenpairResult {
  const residual = eigenpairResidual(matrix, eigenvalue, eigenvector);
  const vectorNorm = complexVectorNorm(eigenvector);
  const relative = vectorNorm > 0 ? residual / vectorNorm : residual;

  return {
    eigenvalue,
    eigenvector,
    eigenpairResidualNorm: residual,
    eigenpairResidualRelative: relative,
    reliable: relative <= residualTolerance
  };
}

function eigenpairResidual(
  matrix: number[][],
  eigenvalue: Eigenvalue,
  eigenvector: ComplexValue[]
): number {
  const transformed = applyMatrixComplex(matrix, eigenvector);
  const scaled = scaleComplexVector(eigenvector, eigenvalue);
  return maxAbsComplex(subtractComplexVectors(transformed, scaled));
}

function inverseIterationReal(
  matrix: number[][],
  eigenvalue: number,
  seedIndex: number,
  tolerance: number
): ComplexValue[] {
  const n = matrix.length;
  let vector = unitVector(n, seedIndex);

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const shift = eigenvalue + (iteration === 0 ? 0 : 1e-11 * (iteration + 1));
    const shifted = matrix.map((row, rowIndex) =>
      row.map((value, colIndex) => (rowIndex === colIndex ? value - shift : value))
    );
    const next = solveRealSystem(shifted, vector);
    const norm = vectorNorm(next);
    if (norm < 1e-15) {
      break;
    }
    vector = next.map((value) => value / norm);

    const rayleigh = rayleighQuotientReal(matrix, vector);
    const residual = maxAbs(
      applyRealMatrix(matrix, vector).map(
        (value, index) => value - rayleigh * (vector[index] ?? 0)
      )
    );
    if (residual < 1e-12) {
      break;
    }
  }

  return vector.map((value) => ({ re: value, im: 0 }));
}

function inverseIterationComplex(
  matrix: number[][],
  eigenvalue: Eigenvalue,
  seedIndex: number,
  tolerance: number
): ComplexValue[] {
  const n = matrix.length;
  let vector = unitVectorComplex(n, seedIndex);

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const shift: ComplexValue = {
      re: eigenvalue.re + (iteration === 0 ? 0 : 1e-11 * (iteration + 1)),
      im: eigenvalue.im
    };
    const next = solveComplexSystem(
      matrix.map((row, rowIndex) =>
        row.map((value, colIndex) => {
          if (rowIndex !== colIndex) {
            return { re: value, im: 0 };
          }
          return { re: value - shift.re, im: -shift.im };
        })
      ),
      vector
    );
    vector = normalizeComplexVector(next);
    if (complexVectorNorm(vector) < 1e-15) {
      break;
    }
  }

  return vector;
}

function rayleighQuotientReal(matrix: number[][], vector: number[]): number {
  const transformed = applyRealMatrix(matrix, vector);
  const numerator = dotReal(vector, transformed);
  const denominator = dotReal(vector, vector);
  return denominator > 0 ? numerator / denominator : 0;
}

function eigenvaluesOf2x2(a: number, b: number, c: number, d: number): Eigenvalue[] {
  const trace = a + d;
  const determinant = a * d - b * c;
  const discriminant = trace * trace - 4 * determinant;

  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const first = (trace + root) / 2;
    const second = (trace - root) / 2;
    return [toEigenvalue(first, 0), toEigenvalue(second, 0)];
  }

  const re = trace / 2;
  const im = Math.sqrt(-discriminant) / 2;
  return [toEigenvalue(re, im), toEigenvalue(re, -im)];
}

function toUpperHessenberg(matrix: number[][]): number[][] {
  const n = matrix.length;

  for (let k = 0; k < n - 2; k += 1) {
    let pivotRow = k + 1;
    let pivotAbs = Math.abs(matrix[pivotRow]?.[k] ?? 0);

    for (let row = k + 2; row < n; row += 1) {
      const value = Math.abs(matrix[row]?.[k] ?? 0);
      if (value > pivotAbs) {
        pivotAbs = value;
        pivotRow = row;
      }
    }

    if (pivotAbs < 1e-15) {
      continue;
    }

    swapRows(matrix, k + 1, pivotRow);
    swapColumns(matrix, k + 1, pivotRow);

    const x = matrix.slice(k + 1).map((row) => row[k] ?? 0);
    const norm = vectorNorm(x);
    if (norm < 1e-15) {
      continue;
    }

    const sign = (x[0] ?? 0) >= 0 ? 1 : -1;
    const u = [...x];
    u[0] = (u[0] ?? 0) + sign * norm;
    const uNorm = vectorNorm(u);
    if (uNorm < 1e-15) {
      continue;
    }

    for (let index = 0; index < u.length; index += 1) {
      u[index] = (u[index] ?? 0) / uNorm;
    }

    for (let col = k; col < n; col += 1) {
      let dot = 0;
      for (let row = k + 1; row < n; row += 1) {
        dot += (u[row - (k + 1)] ?? 0) * (matrix[row]?.[col] ?? 0);
      }
      for (let row = k + 1; row < n; row += 1) {
        matrix[row]![col] = (matrix[row]?.[col] ?? 0) - 2 * (u[row - (k + 1)] ?? 0) * dot;
      }
    }

    for (let row = 0; row < n; row += 1) {
      let dot = 0;
      for (let col = k + 1; col < n; col += 1) {
        dot += (matrix[row]?.[col] ?? 0) * (u[col - (k + 1)] ?? 0);
      }
      for (let col = k + 1; col < n; col += 1) {
        matrix[row]![col] = (matrix[row]?.[col] ?? 0) - 2 * dot * (u[col - (k + 1)] ?? 0);
      }
    }
  }

  return matrix;
}

function francisQrIteration(hessenberg: number[][]): number[][] {
  const n = hessenberg.length;
  const matrix = cloneMatrix(hessenberg);
  const maxIterations = Math.max(100, 30 * n);

  let activeSize = n;
  for (let iteration = 0; iteration < maxIterations && activeSize > 1; iteration += 1) {
    let split = activeSize - 1;
    while (split > 0 && Math.abs(matrix[split]?.[split - 1] ?? 0) <= 1e-12) {
      split -= 1;
    }

    if (split === 0) {
      activeSize -= 1;
      continue;
    }

    const block = matrix.slice(split - 1, activeSize).map((row) =>
      row.slice(split - 1, activeSize)
    );
    const shift = wilkinsonShift(
      block[0]?.[0] ?? 0,
      block[0]?.[1] ?? 0,
      block[1]?.[0] ?? 0,
      block[1]?.[1] ?? 0
    );

    for (let row = split - 1; row < activeSize; row += 1) {
      const diagonal = matrix[row]?.[row] ?? 0;
      matrix[row]![row] = diagonal - shift;
    }

    qrStep(matrix, split - 1, activeSize);

    for (let row = split - 1; row < activeSize; row += 1) {
      const diagonal = matrix[row]?.[row] ?? 0;
      matrix[row]![row] = diagonal + shift;
    }
  }

  return matrix;
}

function wilkinsonShift(a: number, b: number, c: number, d: number): number {
  const trace = a + d;
  const determinant = a * d - b * c;
  const discriminant = trace * trace - 4 * determinant;

  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const first = (trace + root) / 2;
    const second = (trace - root) / 2;
    return Math.abs(first - d) <= Math.abs(second - d) ? first : second;
  }

  return trace / 2;
}

function qrStep(matrix: number[][], start: number, end: number): void {
  const size = end - start;
  if (size <= 1) {
    return;
  }

  for (let col = start; col < end - 1; col += 1) {
    const x = matrix[col]?.[col] ?? 0;
    const y = matrix[col + 1]?.[col] ?? 0;
    const r = Math.hypot(x, y);
    if (r < 1e-15) {
      continue;
    }

    const c = x / r;
    const s = y / r;

    for (let j = col; j < end; j += 1) {
      const aValue = matrix[col]?.[j] ?? 0;
      const bValue = matrix[col + 1]?.[j] ?? 0;
      matrix[col]![j] = c * aValue + s * bValue;
      matrix[col + 1]![j] = -s * aValue + c * bValue;
    }

    for (let j = Math.max(0, col - 1); j < end; j += 1) {
      const aValue = matrix[j]?.[col] ?? 0;
      const bValue = matrix[j]?.[col + 1] ?? 0;
      matrix[j]![col] = c * aValue + s * bValue;
      matrix[j]![col + 1] = -s * aValue + c * bValue;
    }
  }
}

function extractEigenvaluesFromSchur(schur: number[][]): Eigenvalue[] {
  const n = schur.length;
  const eigenvalues: Eigenvalue[] = [];
  let index = 0;

  while (index < n) {
    if (index < n - 1 && Math.abs(schur[index + 1]?.[index] ?? 0) > 1e-8) {
      eigenvalues.push(
        ...eigenvaluesOf2x2(
          schur[index]?.[index] ?? 0,
          schur[index]?.[index + 1] ?? 0,
          schur[index + 1]?.[index] ?? 0,
          schur[index + 1]?.[index + 1] ?? 0
        )
      );
      index += 2;
      continue;
    }

    eigenvalues.push(toEigenvalue(schur[index]?.[index] ?? 0, 0));
    index += 1;
  }

  return eigenvalues.sort((left, right) => right.abs - left.abs);
}

function solveRealSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const augmented = matrix.map((row, rowIndex) => [...row, rhs[rowIndex] ?? 0]);

  for (let pivot = 0; pivot < n; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < n; row += 1) {
      if (Math.abs(augmented[row]?.[pivot] ?? 0) > Math.abs(augmented[maxRow]?.[pivot] ?? 0)) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow]?.[pivot] ?? 0) < 1e-12) {
      return rhs.map(() => 0);
    }

    swapRows(augmented, pivot, maxRow);
    const pivotValue = augmented[pivot]?.[pivot] ?? 0;

    for (let row = pivot + 1; row < n; row += 1) {
      const factor = (augmented[row]?.[pivot] ?? 0) / pivotValue;
      for (let col = pivot; col <= n; col += 1) {
        augmented[row]![col] = (augmented[row]?.[col] ?? 0) - factor * (augmented[pivot]?.[col] ?? 0);
      }
    }
  }

  const solution = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = augmented[row]?.[n] ?? 0;
    for (let col = row + 1; col < n; col += 1) {
      sum -= (augmented[row]?.[col] ?? 0) * (solution[col] ?? 0);
    }
    solution[row] = sum / (augmented[row]?.[row] ?? NaN);
  }

  return solution;
}

function solveComplexSystem(matrix: ComplexValue[][], rhs: ComplexValue[]): ComplexValue[] {
  const n = rhs.length;
  const size = 2 * n;
  const realSystem = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const realRhs = new Array<number>(size).fill(0);

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const entry = matrix[row]?.[col] ?? { re: 0, im: 0 };
      realSystem[row]![col] = entry.re;
      realSystem[row]![col + n] = -entry.im;
      realSystem[row + n]![col] = entry.im;
      realSystem[row + n]![col + n] = entry.re;
    }
    realRhs[row] = rhs[row]?.re ?? 0;
    realRhs[row + n] = rhs[row]?.im ?? 0;
  }

  const solution = solveRealSystem(realSystem, realRhs);
  return Array.from({ length: n }, (_, index) => ({
    re: solution[index] ?? 0,
    im: solution[index + n] ?? 0
  }));
}

function applyRealMatrix(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * (vector[index] ?? 0), 0)
  );
}

function applyMatrixComplex(matrix: number[][], vector: ComplexValue[]): ComplexValue[] {
  return matrix.map((row) =>
    row.reduce<ComplexValue>(
      (sum, value, index) => addComplex(sum, scaleComplex({ re: value, im: 0 }, vector[index] ?? { re: 0, im: 0 })),
      { re: 0, im: 0 }
    )
  );
}

function addComplex(left: ComplexValue, right: ComplexValue): ComplexValue {
  return { re: left.re + right.re, im: left.im + right.im };
}

function subtractComplex(left: ComplexValue, right: ComplexValue): ComplexValue {
  return { re: left.re - right.re, im: left.im - right.im };
}

function scaleComplex(value: ComplexValue, factor: ComplexValue): ComplexValue {
  return {
    re: value.re * factor.re - value.im * factor.im,
    im: value.re * factor.im + value.im * factor.re
  };
}

function scaleComplexVector(vector: ComplexValue[], factor: Eigenvalue): ComplexValue[] {
  return vector.map((entry) => scaleComplex(entry, factor));
}

function subtractComplexVectors(left: ComplexValue[], right: ComplexValue[]): ComplexValue[] {
  return left.map((entry, index) => subtractComplex(entry, right[index] ?? { re: 0, im: 0 }));
}

function dotReal(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
}

function unitVector(length: number, index: number): number[] {
  return Array.from({ length }, (_, position) => (position === index ? 1 : 0));
}

function unitVectorComplex(length: number, index: number): ComplexValue[] {
  return Array.from({ length }, (_, position) =>
    position === index ? { re: 1, im: 0 } : { re: 0, im: 0 }
  );
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

function swapRows(matrix: number[][], first: number, second: number): void {
  if (first === second) {
    return;
  }
  [matrix[first], matrix[second]] = [matrix[second] ?? [], matrix[first] ?? []];
}

function swapColumns(matrix: number[][], first: number, second: number): void {
  if (first === second) {
    return;
  }
  for (const row of matrix) {
    [row[first], row[second]] = [row[second] ?? 0, row[first] ?? 0];
  }
}

function vectorNorm(values: number[]): number {
  return Math.hypot(...values);
}

function complexVectorNorm(values: ComplexValue[]): number {
  return Math.hypot(...values.map((value) => Math.hypot(value.re, value.im)));
}

function normalizeComplexVector(values: ComplexValue[]): ComplexValue[] {
  const norm = complexVectorNorm(values);
  if (norm < 1e-15) {
    return values.map(() => ({ re: 0, im: 0 }));
  }
  return values.map((value) => ({ re: value.re / norm, im: value.im / norm }));
}

function maxAbs(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

function maxAbsComplex(values: ComplexValue[]): number {
  return values.reduce(
    (max, value) => Math.max(max, Math.hypot(value.re, value.im)),
    0
  );
}

function emptyEigenpairResult(eigenvalue: Eigenvalue): EigenpairResult {
  return {
    eigenvalue,
    eigenvector: [],
    eigenpairResidualNorm: 0,
    eigenpairResidualRelative: 0,
    reliable: false
  };
}

function toEigenvalue(re: number, im: number): Eigenvalue {
  return {
    re,
    im,
    abs: Math.hypot(re, im)
  };
}
