import { useCallback, useState } from "react";

const DEFAULT_MAX_ENTRIES = 50;

interface InspectorVariableHistoryState {
  entries: string[];
  index: number;
}

function trimEntries(entries: string[], maxEntries: number): string[] {
  if (entries.length <= maxEntries) {
    return entries;
  }

  const overflow = entries.length - maxEntries;
  return entries.slice(overflow);
}

export function useInspectorVariableHistory(maxEntries = DEFAULT_MAX_ENTRIES) {
  const [state, setState] = useState<InspectorVariableHistoryState>({
    entries: [],
    index: -1
  });

  const currentVariable = state.index >= 0 ? state.entries[state.index] : null;
  const canGoBack = state.index > 0;
  const canGoForward = state.index >= 0 && state.index < state.entries.length - 1;

  const reset = useCallback((variableName: string) => {
    setState({
      entries: [variableName],
      index: 0
    });
  }, []);

  const push = useCallback(
    (variableName: string) => {
      setState((current) => {
        if (current.index >= 0 && current.entries[current.index] === variableName) {
          return current;
        }

        const truncated =
          current.index >= 0 ? current.entries.slice(0, current.index + 1) : [];
        const nextEntries = trimEntries([...truncated, variableName], maxEntries);
        return {
          entries: nextEntries,
          index: nextEntries.length - 1
        };
      });
    },
    [maxEntries]
  );

  const goBack = useCallback((): string | null => {
    let nextVariable: string | null = null;
    setState((current) => {
      if (current.index <= 0) {
        return current;
      }

      const nextIndex = current.index - 1;
      nextVariable = current.entries[nextIndex] ?? null;
      return {
        ...current,
        index: nextIndex
      };
    });
    return nextVariable;
  }, []);

  const goForward = useCallback((): string | null => {
    let nextVariable: string | null = null;
    setState((current) => {
      if (current.index < 0 || current.index >= current.entries.length - 1) {
        return current;
      }

      const nextIndex = current.index + 1;
      nextVariable = current.entries[nextIndex] ?? null;
      return {
        ...current,
        index: nextIndex
      };
    });
    return nextVariable;
  }, []);

  return {
    canGoBack,
    canGoForward,
    currentVariable,
    goBack,
    goForward,
    push,
    reset
  };
}
