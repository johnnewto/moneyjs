import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { EquationBlock, ModelDefinition } from "@sfcr/core";

import { useFloatingPanelPosition } from "../hooks/useFloatingPanelPosition";
import { colorForSolverBlock } from "../lib/solverBlockDag";
import { SolverBlockDagCanvas } from "./SolverBlockDagCanvas";

const FLOATING_PANEL_STORAGE_KEY = "sfcr.solver-block-dag-panel-position";

export interface SolverBlockDagPanelProps {
  label: string;
  model: ModelDefinition;
  blocks: EquationBlock[];
  onClose(): void;
}

export function SolverBlockDagPanel({ label, model, blocks, onClose }: SolverBlockDagPanelProps) {
  const { position, dragHandleProps } = useFloatingPanelPosition(FLOATING_PANEL_STORAGE_KEY);
  const cyclicBlockCount = blocks.filter((block) => block.cyclic).length;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="stability-raw-floating-panel solver-block-dag-panel"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-label="Solver block dependency graph"
    >
      <header
        className="stability-raw-dialog-header stability-raw-dialog-header-draggable"
        {...dragHandleProps}
      >
        <div>
          <div className="eyebrow">Solver blocks</div>
          <h3>{label}</h3>
          <p className="stability-raw-dialog-subtitle">
            {blocks.length} block{blocks.length === 1 ? "" : "s"}
            {cyclicBlockCount > 0 ? ` · ${cyclicBlockCount} cyclic` : ""} · current-period dependencies
          </p>
        </div>
        <button type="button" className="stability-raw-dialog-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="stability-raw-dialog-body solver-block-dag-panel__body">
        <ul className="solver-block-dag-legend" aria-label="Solver block legend">
          {blocks.map((block) => (
            <li key={block.id}>
              <span
                className="solver-block-dag-legend__swatch"
                style={{ backgroundColor: colorForSolverBlock(block.id) }}
                aria-hidden="true"
              />
              <span>
                Block {block.id}
                {block.cyclic ? " (cyclic)" : ""}: {block.equationNames.join(", ")}
              </span>
            </li>
          ))}
        </ul>
        <SolverBlockDagCanvas blocks={blocks} model={model} />
      </div>
    </div>,
    document.body
  );
}
