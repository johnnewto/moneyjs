import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useMemo, type CSSProperties } from "react";

import { NumericValueText } from "../NumericValueText";
import { highlightFormula } from "../EquationGridEditor";
import { collectEquationDenominatorVariables } from "../../lib/equationDivisionAnalysis";
import { formatStockRoleLabel } from "../../notebook/matrixSemantics";
import {
  MULTIPORT_NODE_WIDTH,
  MULTIPORT_ROW_GAP,
  MULTIPORT_ROW_HEIGHT,
  MULTIPORT_ROW_TOP,
  MULTIPORT_STOCK_FOOTER_GAP,
  MULTIPORT_STOCK_FOOTER_BOTTOM_PAD,
  MULTIPORT_STOCK_ROW_HEIGHT,
  handleId,
  type MatrixMultiportNodeData,
  type MatrixMultiportNoteNodeData,
  type MatrixMultiportPort,
  type MultiportSide
} from "../transactionFlowMultiportLayout";
import { useMultiportVariableInspect } from "./MultiportVariableInspectContext";

const MULTIPORT_PALETTES = [
  "matrix-multiport--green",
  "matrix-multiport--sky",
  "matrix-multiport--amber",
  "matrix-multiport--purple",
  "matrix-multiport--orange",
  "matrix-multiport--slate"
] as const;

const ACCOUNT_ICONS = ["HH", "FC", "FK", "BC", "BK"] as const;

export function MatrixMultiportNode({ data }: NodeProps) {
  const nodeData = data as unknown as MatrixMultiportNodeData;
  const palette = MULTIPORT_PALETTES[nodeData.order % MULTIPORT_PALETTES.length];
  const icon = ACCOUNT_ICONS[nodeData.order % ACCOUNT_ICONS.length];
  const stocksFooterHeight =
    nodeData.stocks.length > 0
      ? MULTIPORT_STOCK_FOOTER_GAP +
        nodeData.stocks.length * MULTIPORT_STOCK_ROW_HEIGHT +
        MULTIPORT_STOCK_FOOTER_BOTTOM_PAD
      : 0;

  return (
    <div
      className={`matrix-multiport ${palette}`}
      style={
        stocksFooterHeight > 0
          ? ({ "--multiport-stocks-height": `${stocksFooterHeight}px` } as CSSProperties)
          : undefined
      }
    >
      <div
        className="matrix-multiport__header matrix-multiport__drag-handle"
        title="Drag header to reorder column"
        aria-label={`${nodeData.label} column. Drag header to reorder.`}
      >
        <span className="matrix-multiport__drag-grip" aria-hidden="true" />
        <div className="matrix-multiport__icon" aria-hidden="true">
          {icon}
        </div>
        <div className="matrix-multiport__title">{nodeData.label}</div>
      </div>
      <div className="matrix-multiport__ports">
        {nodeData.ports.map((port) => (
          <MatrixMultiportPortView key={port.rowIndex} port={port} />
        ))}
      </div>
      {nodeData.stocks.length > 0 ? (
        <MatrixMultiportStocksFooter stocks={nodeData.stocks} />
      ) : null}
    </div>
  );
}

function MatrixMultiportStocksFooter({
  stocks
}: {
  stocks: MatrixMultiportNodeData["stocks"];
}) {
  const inspect = useMultiportVariableInspect();

  return (
    <div className="matrix-multiport__stocks" aria-label="Stock balances">
      {stocks.map((stock) => (
        <div key={stock.variableName} className="matrix-multiport__stock">
          {stock.role ? (
            <span
              className={`notebook-godley-role notebook-godley-role-${stock.role} matrix-multiport__stock-role`}
              aria-label={stock.role}
            >
              {formatStockRoleLabel(stock.role)}
            </span>
          ) : null}
          {inspect?.onSelectVariable ? (
            <button
              type="button"
              className="matrix-multiport__stock-name result-variable-button"
              onClick={() => inspect.onSelectVariable?.(stock.variableName)}
            >
              {stock.displayName}
            </button>
          ) : (
            <span className="matrix-multiport__stock-name">{stock.displayName}</span>
          )}
          <span className="matrix-multiport__stock-separator">:</span>
          {Number.isFinite(stock.value ?? NaN) ? (
            <NumericValueText
              className="matrix-multiport__stock-value"
              value={stock.value ?? 0}
              unitMeta={stock.unitMeta ?? inspect?.variableUnitMetadata.get(stock.variableName)}
              options={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
            />
          ) : (
            <span className="matrix-multiport__stock-value">{stock.formattedValue}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function MatrixMultiportNoteNode({ data }: NodeProps) {
  const noteData = data as unknown as MatrixMultiportNoteNodeData;
  return (
    <div className="matrix-multiport-note" role="note">
      {noteData.text}
    </div>
  );
}

function MatrixMultiportPortView({ port }: { port: MatrixMultiportPort }) {
  const inspect = useMultiportVariableInspect();
  const hasEntry = port.entry.trim().length > 0;
  const isSource = port.sign < 0;
  const isTarget = port.sign > 0;
  const entrySource = port.entry.trim();
  const denominatorVariableNames = useMemo(
    () => collectEquationDenominatorVariables(entrySource),
    [entrySource]
  );

  return (
    <div
      className={[
        "matrix-multiport__port",
        hasEntry ? "has-entry" : "",
        isSource ? "is-source" : "",
        isTarget ? "is-target" : "",
        port.highlighted ? "is-highlighted" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        top: MULTIPORT_ROW_TOP + port.rowIndex * MULTIPORT_ROW_GAP,
        height: MULTIPORT_ROW_HEIGHT,
        width: MULTIPORT_NODE_WIDTH
      }}
    >
      {hasEntry
        ? port.sides.map((side) => (
            <MultiportHandles key={side} rowIndex={port.rowIndex} side={side} />
          ))
        : null}
      {hasEntry ? (
        <div
          className="matrix-multiport__port-card"
          title={inspect ? undefined : `${port.rowLabel}: ${port.entry}`}
          onMouseDown={(event) => {
            if ((event.target as HTMLElement).closest(".formula-token.is-clickable")) {
              event.stopPropagation();
            }
          }}
        >
          <div className="matrix-multiport__port-label">{port.rowLabel}</div>
          <div className="matrix-multiport__port-entry">
            {inspect && entrySource ? (
              <span className="matrix-multiport__port-formula nodrag nopan">
                {highlightFormula(
                  entrySource,
                  inspect.parameterNames,
                  undefined,
                  inspect.variableDescriptions,
                  inspect.variableUnitMetadata,
                  inspect.onSelectVariable,
                  undefined,
                  inspect.currentValues,
                  inspect.highlightedVariable,
                  true,
                  inspect.laggedCurrentValues,
                  inspect.laggedPeriodLabel,
                  denominatorVariableNames
                )}
              </span>
            ) : (
              port.entry
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MultiportHandles({ rowIndex, side }: { rowIndex: number; side: MultiportSide }) {
  const handlePosition = side === "left" ? Position.Left : Position.Right;

  return (
    <>
      <Handle
        id={handleId(side, rowIndex)}
        type="source"
        position={handlePosition}
        className="matrix-multiport__handle"
      />
      <Handle
        id={handleId(side, rowIndex)}
        type="target"
        position={handlePosition}
        className="matrix-multiport__handle"
      />
    </>
  );
}
