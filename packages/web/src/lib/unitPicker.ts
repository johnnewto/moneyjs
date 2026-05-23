import {
  divideSignatures,
  multiplySignatures,
  normalizeSignature,
  type BaseDimension,
  type StockFlowKind,
  type UnitSignature
} from "./unitMeta";

export type UnitPickerShape = "none" | "single" | "multiply" | "divide";
export type UnitPickerOperand = "none" | BaseDimension;

export interface UnitPickerForm {
  shape: UnitPickerShape;
  singleDimension: BaseDimension;
  leftOperand: UnitPickerOperand;
  rightOperand: BaseDimension;
}

export const BASE_DIMENSION_OPTIONS: Array<{ value: BaseDimension; label: string }> = [
  { value: "money", label: "$" },
  { value: "items", label: "items" },
  { value: "time", label: "yr" }
];

export const DEFAULT_UNIT_PICKER_FORM: UnitPickerForm = {
  shape: "none",
  singleDimension: "money",
  leftOperand: "money",
  rightOperand: "time"
};

export function signatureToUnitPickerForm(signature?: UnitSignature): UnitPickerForm {
  const normalized = normalizeSignature(signature);
  const activeDimensions = BASE_DIMENSION_OPTIONS.map((option) => option.value).filter(
    (dimension) => (normalized[dimension] ?? 0) !== 0
  );

  if (activeDimensions.length === 0) {
    return { ...DEFAULT_UNIT_PICKER_FORM, shape: "none" };
  }

  if (activeDimensions.length === 1) {
    const dimension = activeDimensions[0]!;
    const exponent = normalized[dimension] ?? 0;
    if (exponent === 1) {
      return { ...DEFAULT_UNIT_PICKER_FORM, shape: "single", singleDimension: dimension };
    }
    if (exponent === -1) {
      return {
        ...DEFAULT_UNIT_PICKER_FORM,
        shape: "divide",
        leftOperand: "none",
        rightOperand: dimension
      };
    }
  }

  if (activeDimensions.length === 2) {
    const [leftDimension, rightDimension] = activeDimensions;
    const leftExponent = normalized[leftDimension] ?? 0;
    const rightExponent = normalized[rightDimension] ?? 0;

    if (leftExponent === 1 && rightExponent === 1) {
      return {
        ...DEFAULT_UNIT_PICKER_FORM,
        shape: "multiply",
        leftOperand: leftDimension,
        rightOperand: rightDimension
      };
    }

    if (leftExponent === 1 && rightExponent === -1) {
      return {
        ...DEFAULT_UNIT_PICKER_FORM,
        shape: "divide",
        leftOperand: leftDimension,
        rightOperand: rightDimension
      };
    }

    if (leftExponent === -1 && rightExponent === 1) {
      return {
        ...DEFAULT_UNIT_PICKER_FORM,
        shape: "divide",
        leftOperand: rightDimension,
        rightOperand: leftDimension
      };
    }
  }

  const firstDimension = activeDimensions[0] ?? "money";
  return { ...DEFAULT_UNIT_PICKER_FORM, shape: "single", singleDimension: firstDimension };
}

export function unitPickerFormToSignature(form: UnitPickerForm): UnitSignature {
  switch (form.shape) {
    case "none":
      return {};
    case "single":
      return { [form.singleDimension]: 1 };
    case "multiply": {
      if (form.leftOperand === "none" || form.leftOperand === form.rightOperand) {
        return {};
      }
      return multiplySignatures(
        { [form.leftOperand]: 1 },
        { [form.rightOperand]: 1 }
      );
    }
    case "divide": {
      if (form.leftOperand !== "none" && form.leftOperand === form.rightOperand) {
        return {};
      }
      const leftSignature =
        form.leftOperand === "none" ? {} : { [form.leftOperand]: 1 };
      return divideSignatures(leftSignature, { [form.rightOperand]: 1 });
    }
  }
}

export function rightOperandOptions(
  leftOperand: UnitPickerOperand,
  shape: UnitPickerShape
): Array<{ value: BaseDimension; label: string }> {
  if (shape === "multiply" && leftOperand !== "none") {
    return BASE_DIMENSION_OPTIONS.filter((option) => option.value !== leftOperand);
  }
  if (shape === "divide" && leftOperand !== "none") {
    return BASE_DIMENSION_OPTIONS.filter((option) => option.value !== leftOperand);
  }
  return BASE_DIMENSION_OPTIONS;
}

export function normalizeUnitPickerForm(form: UnitPickerForm): UnitPickerForm {
  if (form.shape === "none" || form.shape === "single") {
    return form;
  }

  let leftOperand = form.leftOperand;
  if (form.shape === "multiply" && leftOperand === "none") {
    leftOperand = form.singleDimension;
  }

  const allowedRight = rightOperandOptions(leftOperand, form.shape);
  const rightOperand = allowedRight.some((option) => option.value === form.rightOperand)
    ? form.rightOperand
    : allowedRight[0]?.value ?? "time";

  if (leftOperand === form.leftOperand && rightOperand === form.rightOperand) {
    return form;
  }

  return {
    ...form,
    leftOperand,
    rightOperand
  };
}

export function defaultPickerFormForKind(stockFlow?: StockFlowKind): UnitPickerForm | null {
  switch (stockFlow) {
    case "stock":
      return normalizeUnitPickerForm({
        ...DEFAULT_UNIT_PICKER_FORM,
        shape: "single",
        singleDimension: "money"
      });
    case "flow":
      return normalizeUnitPickerForm({
        ...DEFAULT_UNIT_PICKER_FORM,
        shape: "divide",
        leftOperand: "money",
        rightOperand: "time"
      });
    default:
      return null;
  }
}

export function applyStockFlowToUnitDraft(args: {
  currentPickerForm: UnitPickerForm;
  stockFlow: StockFlowKind | undefined;
}): UnitPickerForm {
  if (args.currentPickerForm.shape !== "none") {
    return args.currentPickerForm;
  }

  return defaultPickerFormForKind(args.stockFlow) ?? args.currentPickerForm;
}
