import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";

export const EQUATION_INITIAL_COLUMN_COLLAPSED_STORAGE_KEY =
  "sfcr.equation-view.initial-column-collapsed";
export const EQUATION_CURRENT_COLUMN_COLLAPSED_STORAGE_KEY =
  "sfcr.equation-view.current-column-collapsed";
export const EQUATION_GAIN_COLUMN_COLLAPSED_STORAGE_KEY =
  "sfcr.equation-view.gain-column-collapsed";
export const EQUATION_ROLE_COLUMN_COLLAPSED_STORAGE_KEY =
  "sfcr.equation-view.role-column-collapsed";

const MIN_VARIABLE_WIDTH_PX = 120;
const MIN_EXPRESSION_WIDTH_PX = 160;
const EQUATION_VIEW_ROLE_COLUMN_MIN_WIDTH_PX = 68;
const EQUATION_VIEW_INITIAL_COLUMN_MIN_WIDTH_PX = 72;
const EQUATION_VIEW_CURRENT_COLUMN_MIN_WIDTH_PX = 92;
const EQUATION_VIEW_GAIN_COLUMN_MIN_WIDTH_PX = 88;
const EQUATION_VIEW_COLUMN_TOGGLE_WIDTH_PX = 18;
const MIN_TRAILING_WIDTH_PX = 160;
const EQUATION_VIEW_LAYOUT_PADDING_PX = 0.6 * 3 * 16 + 0.75 * 16 + 0.35 * 16;
const COLLAPSE_HYSTERESIS_PX = 48;

export type EquationViewColumnCollapseState = {
  initialCollapsed: boolean;
  currentCollapsed: boolean;
  gainCollapsed: boolean;
  roleCollapsed: boolean;
};

const AUTO_COLLAPSE_PRESETS: EquationViewColumnCollapseState[] = [
  { initialCollapsed: false, currentCollapsed: false, gainCollapsed: false, roleCollapsed: false },
  { initialCollapsed: true, currentCollapsed: false, gainCollapsed: false, roleCollapsed: false },
  { initialCollapsed: true, currentCollapsed: true, gainCollapsed: false, roleCollapsed: false },
  { initialCollapsed: true, currentCollapsed: true, gainCollapsed: true, roleCollapsed: false },
  { initialCollapsed: true, currentCollapsed: true, gainCollapsed: true, roleCollapsed: true }
];

function readStoredColumnCollapsed(storageKey: string): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue == null) {
      return null;
    }
    return storedValue === "true";
  } catch {
    return null;
  }
}

function writeStoredColumnCollapsed(storageKey: string, collapsed: boolean): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(collapsed));
  } catch {
    // Ignore storage failures so collapse still works in restricted environments.
  }
}

function collapsePresetIndex(state: EquationViewColumnCollapseState): number {
  const index = AUTO_COLLAPSE_PRESETS.findIndex(
    (preset) =>
      preset.initialCollapsed === state.initialCollapsed &&
      preset.currentCollapsed === state.currentCollapsed &&
      preset.gainCollapsed === state.gainCollapsed &&
      preset.roleCollapsed === state.roleCollapsed
  );
  return index >= 0 ? index : AUTO_COLLAPSE_PRESETS.length - 1;
}

export function getEquationViewTrailingReservedWidthPx(
  collapse: EquationViewColumnCollapseState
): number {
  const initialWidthPx = collapse.initialCollapsed
    ? EQUATION_VIEW_COLUMN_TOGGLE_WIDTH_PX
    : EQUATION_VIEW_INITIAL_COLUMN_MIN_WIDTH_PX;
  const currentWidthPx = collapse.currentCollapsed
    ? EQUATION_VIEW_COLUMN_TOGGLE_WIDTH_PX
    : EQUATION_VIEW_CURRENT_COLUMN_MIN_WIDTH_PX;
  const gainWidthPx = collapse.gainCollapsed
    ? EQUATION_VIEW_COLUMN_TOGGLE_WIDTH_PX
    : EQUATION_VIEW_GAIN_COLUMN_MIN_WIDTH_PX;
  const roleWidthPx = collapse.roleCollapsed
    ? EQUATION_VIEW_COLUMN_TOGGLE_WIDTH_PX
    : EQUATION_VIEW_ROLE_COLUMN_MIN_WIDTH_PX;

  return (
    initialWidthPx +
    currentWidthPx +
    gainWidthPx +
    roleWidthPx +
    MIN_TRAILING_WIDTH_PX +
    EQUATION_VIEW_LAYOUT_PADDING_PX
  );
}

export function getEquationViewMinWidthPx(collapse: EquationViewColumnCollapseState): number {
  return (
    MIN_VARIABLE_WIDTH_PX +
    MIN_EXPRESSION_WIDTH_PX +
    getEquationViewTrailingReservedWidthPx(collapse)
  );
}

export function getEquationViewExpandedMinWidthPx(): number {
  return getEquationViewMinWidthPx({
    initialCollapsed: false,
    currentCollapsed: false,
    gainCollapsed: false,
    roleCollapsed: false
  });
}

function resolveAutoColumnCollapse(
  widthPx: number,
  current: EquationViewColumnCollapseState
): EquationViewColumnCollapseState {
  const currentIndex = collapsePresetIndex(current);

  if (currentIndex > 0) {
    const expandTarget = AUTO_COLLAPSE_PRESETS[currentIndex - 1];
    if (widthPx >= getEquationViewMinWidthPx(expandTarget) + COLLAPSE_HYSTERESIS_PX) {
      return expandTarget;
    }
  }

  const currentPreset = AUTO_COLLAPSE_PRESETS[currentIndex];
  if (widthPx < getEquationViewMinWidthPx(currentPreset)) {
    if (currentIndex < AUTO_COLLAPSE_PRESETS.length - 1) {
      const deeperPreset = AUTO_COLLAPSE_PRESETS[currentIndex + 1];
      if (widthPx < getEquationViewMinWidthPx(deeperPreset)) {
        return AUTO_COLLAPSE_PRESETS[AUTO_COLLAPSE_PRESETS.length - 1];
      }
      return deeperPreset;
    }
  }

  if (widthPx >= getEquationViewMinWidthPx(AUTO_COLLAPSE_PRESETS[0])) {
    return AUTO_COLLAPSE_PRESETS[0];
  }

  return current;
}

export type EquationValueColumnsCollapseControls = {
  initialColumnCollapsed: boolean;
  currentColumnCollapsed: boolean;
  gainColumnCollapsed: boolean;
  roleColumnCollapsed: boolean;
  toggleInitialColumn(): void;
  toggleCurrentColumn(): void;
  toggleGainColumn(): void;
  toggleRoleColumn(): void;
};

export function useEquationValueColumnsCollapse(
  shellRef: RefObject<HTMLElement | null>
): EquationValueColumnsCollapseControls {
  const [userInitialCollapsed, setUserInitialCollapsed] = useState<boolean | null>(() =>
    readStoredColumnCollapsed(EQUATION_INITIAL_COLUMN_COLLAPSED_STORAGE_KEY)
  );
  const [userCurrentCollapsed, setUserCurrentCollapsed] = useState<boolean | null>(() =>
    readStoredColumnCollapsed(EQUATION_CURRENT_COLUMN_COLLAPSED_STORAGE_KEY)
  );
  const [userGainCollapsed, setUserGainCollapsed] = useState<boolean | null>(() =>
    readStoredColumnCollapsed(EQUATION_GAIN_COLUMN_COLLAPSED_STORAGE_KEY)
  );
  const [userRoleCollapsed, setUserRoleCollapsed] = useState<boolean | null>(() =>
    readStoredColumnCollapsed(EQUATION_ROLE_COLUMN_COLLAPSED_STORAGE_KEY)
  );
  const [autoCollapsed, setAutoCollapsed] = useState<EquationViewColumnCollapseState>(
    AUTO_COLLAPSE_PRESETS[0]
  );
  const autoCollapsedRef = useRef(autoCollapsed);

  useEffect(() => {
    autoCollapsedRef.current = autoCollapsed;
  }, [autoCollapsed]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const updateAutoCollapsed = (widthPx: number) => {
      setAutoCollapsed((current) => resolveAutoColumnCollapse(widthPx, current));
    };

    updateAutoCollapsed(shell.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateAutoCollapsed(entry.contentRect.width);
    });
    observer.observe(shell);

    return () => observer.disconnect();
  }, [shellRef]);

  const initialColumnCollapsed = userInitialCollapsed ?? autoCollapsed.initialCollapsed;
  const currentColumnCollapsed = userCurrentCollapsed ?? autoCollapsed.currentCollapsed;
  const gainColumnCollapsed = userGainCollapsed ?? autoCollapsed.gainCollapsed;
  const roleColumnCollapsed = userRoleCollapsed ?? autoCollapsed.roleCollapsed;

  const toggleInitialColumn = useCallback(() => {
    setUserInitialCollapsed((current) => {
      const nextCollapsed = !(current ?? autoCollapsedRef.current.initialCollapsed);
      writeStoredColumnCollapsed(EQUATION_INITIAL_COLUMN_COLLAPSED_STORAGE_KEY, nextCollapsed);
      return nextCollapsed;
    });
  }, []);

  const toggleCurrentColumn = useCallback(() => {
    setUserCurrentCollapsed((current) => {
      const nextCollapsed = !(current ?? autoCollapsedRef.current.currentCollapsed);
      writeStoredColumnCollapsed(EQUATION_CURRENT_COLUMN_COLLAPSED_STORAGE_KEY, nextCollapsed);
      return nextCollapsed;
    });
  }, []);

  const toggleGainColumn = useCallback(() => {
    setUserGainCollapsed((current) => {
      const nextCollapsed = !(current ?? autoCollapsedRef.current.gainCollapsed);
      writeStoredColumnCollapsed(EQUATION_GAIN_COLUMN_COLLAPSED_STORAGE_KEY, nextCollapsed);
      return nextCollapsed;
    });
  }, []);

  const toggleRoleColumn = useCallback(() => {
    setUserRoleCollapsed((current) => {
      const nextCollapsed = !(current ?? autoCollapsedRef.current.roleCollapsed);
      writeStoredColumnCollapsed(EQUATION_ROLE_COLUMN_COLLAPSED_STORAGE_KEY, nextCollapsed);
      return nextCollapsed;
    });
  }, []);

  return {
    initialColumnCollapsed,
    currentColumnCollapsed,
    gainColumnCollapsed,
    roleColumnCollapsed,
    toggleInitialColumn,
    toggleCurrentColumn,
    toggleGainColumn,
    toggleRoleColumn
  };
}
