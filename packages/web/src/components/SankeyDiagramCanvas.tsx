import { useMemo } from "react";

import type { ParsedSankeyDiagram } from "../notebook/sankey";
import { computeLayeredSankeyLayout } from "./sankeyLayout";

export function SankeyDiagramCanvas({
  diagram,
  width = 960,
  height = 480
}: {
  diagram: ParsedSankeyDiagram;
  width?: number;
  height?: number;
}) {
  const layout = useMemo(
    () => computeLayeredSankeyLayout(diagram.nodes, diagram.links, width, height),
    [diagram.links, diagram.nodes, height, width]
  );

  if (diagram.errors.length > 0) {
    return (
      <div className="sankey-diagram-errors" role="alert">
        {diagram.errors.map((error) => (
          <p key={error}>{error}</p>
        ))}
      </div>
    );
  }

  if (layout.nodes.length === 0) {
    return <div className="sankey-diagram-empty">No Sankey flows to display.</div>;
  }

  const maxLayer = layout.nodes.reduce((max, node) => Math.max(max, node.layer), 0);

  return (
    <svg
      aria-label="Sankey diagram"
      className="sankey-diagram-canvas"
      height={layout.height}
      role="img"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width="100%"
    >
      <g className="sankey-diagram-links">
        {layout.links.map((link, index) => (
          <path
            key={`${link.label ?? "link"}-${index}`}
            d={link.path}
            fill="none"
            stroke={link.stroke}
            strokeOpacity={link.strokeOpacity}
            strokeWidth={link.strokeWidth}
          />
        ))}
      </g>
      <g className="sankey-diagram-nodes">
        {layout.nodes.map((node) => {
          const labelOnLeft = node.layer === 0;
          const labelOnRight = node.layer === maxLayer;
          const labelX = labelOnLeft ? node.x - 8 : node.x + node.width + 8;
          const textAnchor = labelOnLeft ? "end" : "start";
          const labelY = Math.min(
            layout.height - 8,
            Math.max(8, node.y + Math.max(node.height, 12) / 2)
          );

          return (
            <g key={node.id} className="sankey-diagram-node">
              <title>{node.label}</title>
              <rect
                fill={node.fill}
                height={node.height}
                rx={2}
                ry={2}
                stroke="rgba(15, 23, 42, 0.18)"
                strokeWidth={1}
                width={node.width}
                x={node.x}
                y={node.y}
              />
              <text
                dominantBaseline="middle"
                fill="var(--text-primary, #1f2937)"
                fontSize={12}
                textAnchor={textAnchor}
                x={labelX}
                y={labelY}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
