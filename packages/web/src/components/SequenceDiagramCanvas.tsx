import { useEffect, useMemo, useRef, useState } from "react";
import type { VariableDescriptions } from "../lib/variableDescriptions";

import type {
  ParsedDiagram,
  SequenceDividerStep,
  SequenceMessageStep,
  SequenceNoteStep,
  SequenceParticipant,
  SequenceStep
} from "../notebook/sequence";

interface SequenceDiagramCanvasProps {
  diagram: ParsedDiagram;
  visibleStepCount: number;
  highlightedStepIndex: number | null;
  variableDescriptions?: VariableDescriptions;
}

interface LayoutParticipant extends SequenceParticipant {
  x: number;
}

interface SequenceLayout {
  width: number;
  height: number;
  participantBoxWidth: number;
  participantBoxHeight: number;
  participants: LayoutParticipant[];
  stepYs: number[];
  contentLeft: number;
  contentRight: number;
  lifelineTop: number;
  lifelineBottom: number;
  bottomBoxTop: number;
}

const MIN_CANVAS_WIDTH = 620;
const SIDE_PADDING = 26;
const PARTICIPANT_BOX_HEIGHT = 40;
const HEADER_TOP = 6;
const LIFELINE_TOP_GAP = 20;
const STEP_GAP = 40;
const FOOTER_GAP = 72;
const HORIZONTAL_COMPACTNESS = 0.82;
const BOTTOM_BOX_TOP_GAP = -12;

export function SequenceDiagramCanvas({
  diagram,
  visibleStepCount,
  highlightedStepIndex,
  variableDescriptions
}: SequenceDiagramCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(MIN_CANVAS_WIDTH);
  const [highlightAnimationSeed, setHighlightAnimationSeed] = useState(0);
  const previousHighlightRef = useRef<number | null>(null);

  const steps = useMemo(
    () => diagram.steps.slice(0, Math.max(0, Math.min(visibleStepCount, diagram.steps.length))),
    [diagram.steps, visibleStepCount]
  );
  const layout = useMemo(() => buildSequenceLayout(diagram, width), [diagram, width]);
  const maxMagnitude = useMemo(
    () =>
      steps.reduce((currentMax, step) => {
        if (step.type !== "message" || step.magnitude == null || !Number.isFinite(step.magnitude)) {
          return currentMax;
        }
        return Math.max(currentMax, Math.abs(step.magnitude));
      }, 0),
    [steps]
  );

  useEffect(() => {
    function updateWidth(): void {
      const nextWidth = Math.max(
        MIN_CANVAS_WIDTH,
        Math.round(wrapperRef.current?.clientWidth ?? MIN_CANVAS_WIDTH)
      );
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    }

    updateWidth();

    if (typeof ResizeObserver !== "undefined" && wrapperRef.current) {
      const observer = new ResizeObserver(() => updateWidth());
      observer.observe(wrapperRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (
      highlightedStepIndex != null &&
      previousHighlightRef.current !== highlightedStepIndex
    ) {
      setHighlightAnimationSeed((current) => current + 1);
    }
    previousHighlightRef.current = highlightedStepIndex;
  }, [highlightedStepIndex]);

  return (
    <div ref={wrapperRef} className="sequence-canvas-shell">
      <svg
        className="sequence-canvas"
        aria-label="Sequence diagram"
        role="img"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        <defs>
          <linearGradient id="sequence-background" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffef9" />
            <stop offset="100%" stopColor="#f5f7fb" />
          </linearGradient>
        </defs>

        <rect x={0} y={0} width={layout.width} height={layout.height} fill="url(#sequence-background)" />

        {layout.participants.map((participant) => (
          <line
            key={`lifeline-${participant.id}`}
            x1={participant.x}
            y1={layout.lifelineTop + 6}
            x2={participant.x}
            y2={layout.lifelineBottom + 14}
            stroke="rgba(15, 23, 42, 0.76)"
            strokeDasharray="8 6"
            strokeWidth={2}
          />
        ))}

        <ParticipantBoxes
          participants={layout.participants}
          top={layout.lifelineTop - layout.participantBoxHeight / 2}
          boxWidth={layout.participantBoxWidth}
          boxHeight={layout.participantBoxHeight}
          variableDescriptions={variableDescriptions}
        />

        <ParticipantBoxes
          participants={layout.participants}
          top={layout.bottomBoxTop}
          boxWidth={layout.participantBoxWidth}
          boxHeight={layout.participantBoxHeight}
          variableDescriptions={variableDescriptions}
        />

        {steps.map((step, stepIndex) => {
          const y = layout.stepYs[stepIndex] ?? layout.lifelineTop + STEP_GAP * (stepIndex + 1);

          if (step.type === "message") {
            return (
              <MessageShape
                key={`step-${stepIndex}-${highlightAnimationSeed}`}
                highlighted={highlightedStepIndex === stepIndex}
                layout={layout}
                maxMagnitude={maxMagnitude}
                step={step}
                y={y}
              />
            );
          }
          if (step.type === "note") {
            return <NoteShape key={`step-${stepIndex}`} layout={layout} step={step} y={y} />;
          }
          return <DividerShape key={`step-${stepIndex}`} layout={layout} step={step} y={y} />;
        })}
      </svg>
    </div>
  );
}

function ParticipantBoxes({
  participants,
  top,
  boxWidth,
  boxHeight,
  variableDescriptions
}: {
  participants: LayoutParticipant[];
  top: number;
  boxWidth: number;
  boxHeight: number;
  variableDescriptions?: VariableDescriptions;
}) {
  return (
    <>
      {participants.map((participant) => {
        const left = participant.x - boxWidth / 2;
        const lines = wrapText(participant.label, boxWidth - 14, 13);

        return (
          <g key={`${participant.id}-${top}`}>
            {variableDescriptions?.get(participant.id) ? (
              <title>{variableDescriptions.get(participant.id)}</title>
            ) : null}
            <rect
              x={left}
              y={top}
              width={boxWidth}
              height={boxHeight}
              rx={8}
              ry={8}
              fill="#dfe3f1"
              stroke="rgba(15, 23, 42, 0.68)"
              strokeWidth={2}
            />
            <text
              x={participant.x}
              y={top + boxHeight / 2}
              fill="#111827"
              fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
              fontSize={13}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {lines.map((line, index) => (
                <tspan
                  key={`${participant.id}-line-${index}`}
                  x={participant.x}
                  dy={index === 0 ? -(lines.length - 1) * 7 : 14}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </>
  );
}

function MessageShape({
  step,
  layout,
  y,
  maxMagnitude,
  highlighted
}: {
  step: SequenceMessageStep;
  layout: SequenceLayout;
  y: number;
  maxMagnitude: number;
  highlighted: boolean;
}) {
  const sender = layout.participants.find((participant) => participant.id === step.senderId);
  const receiver = layout.participants.find((participant) => participant.id === step.receiverId);
  if (!sender || !receiver) {
    return null;
  }

  const color = step.color ?? "#4f46e5";
  const strokeWidth = computeMessageWidth(step.magnitude, maxMagnitude);
  const arrowSize = Math.max(7, strokeWidth * 2.1);
  const isSelfMessage = sender.id === receiver.id;
  const labelX = isSelfMessage ? sender.x + 34 : (sender.x + receiver.x) / 2;
  const labelY = isSelfMessage ? y - 12 : y - 13;
  const labelWidth = isSelfMessage ? 128 : Math.max(92, Math.abs(receiver.x - sender.x) - 16);
  const labelLines = wrapText(step.label, labelWidth, 12);

  const path = isSelfMessage
    ? `M ${sender.x} ${y} H ${sender.x + 46} V ${y + 24} H ${sender.x + 10}`
    : buildHorizontalMessagePath(sender.x, receiver.x, y);
  const arrow = isSelfMessage
    ? buildArrowHeadPoints(sender.x + 10, y + 24, Math.PI, arrowSize)
    : buildArrowHeadPoints(
        receiver.x,
        y,
        sender.x <= receiver.x ? 0 : Math.PI,
        arrowSize
      );

  return (
    <g>
      {highlighted ? (
        <path
          d={path}
          fill="none"
          stroke={applyAlpha(color, 0.38)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth + 5}
        >
          <animate attributeName="stroke-opacity" values="0.85;0" dur="650ms" fill="freeze" />
          <animate
            attributeName="stroke-width"
            values={`${strokeWidth + 8};${strokeWidth + 2}`}
            dur="650ms"
            fill="freeze"
          />
        </path>
      ) : null}

      <path
        d={path}
        fill="none"
        stroke={color}
        strokeDasharray={step.lineStyle === "dashed" ? "8 6" : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
      <polygon points={arrow} fill={color} />

      <text
        x={labelX}
        y={labelY}
        fill="#111827"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={12}
        fontWeight={500}
        textAnchor="middle"
      >
        {labelLines.map((line, index) => (
          <tspan
            key={`${step.senderId}-${step.receiverId}-${index}`}
            x={labelX}
            dy={index === 0 ? -(labelLines.length - 1) * 7 : 14}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function NoteShape({
  layout,
  step,
  y
}: {
  layout: SequenceLayout;
  step: SequenceNoteStep;
  y: number;
}) {
  const participants = step.participantIds
    .map((participantId) =>
      layout.participants.find((participant) => participant.id === participantId)
    )
    .filter((participant): participant is LayoutParticipant => Boolean(participant));
  if (participants.length === 0) {
    return null;
  }

  const anchor =
    step.position === "left"
      ? participants[0].x - 92
      : step.position === "right"
        ? participants[participants.length - 1].x + 92
        : participants.reduce((sum, participant) => sum + participant.x, 0) / participants.length;
  const noteWidth = Math.min(220, Math.max(132, participants.length * 82));
  const left = Math.max(16, Math.min(layout.width - noteWidth - 16, anchor - noteWidth / 2));
  const top = y - 16;
  const height = 34;
  const lines = wrapText(step.text, noteWidth - 14, 11);

  return (
    <g>
      <rect
        x={left}
        y={top}
        width={noteWidth}
        height={height}
        rx={8}
        ry={8}
        fill="rgba(255, 251, 214, 0.96)"
        stroke="rgba(146, 118, 33, 0.58)"
        strokeWidth={1.5}
      />
      <text
        x={left + noteWidth / 2}
        y={top + height / 2}
        fill="#594113"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={11}
        fontWeight={500}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {lines.map((line, index) => (
          <tspan
            key={`${step.text}-${index}`}
            x={left + noteWidth / 2}
            dy={index === 0 ? -(lines.length - 1) * 6 : 12}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function DividerShape({
  layout,
  step,
  y
}: {
  layout: SequenceLayout;
  step: SequenceDividerStep;
  y: number;
}) {
  const badgeWidth = Math.max(84, estimateTextWidth(step.label, 11) + 22);
  const badgeLeft = layout.width / 2 - badgeWidth / 2;

  return (
    <g>
      <line
        x1={layout.contentLeft}
        y1={y}
        x2={layout.contentRight}
        y2={y}
        stroke="rgba(100, 116, 139, 0.52)"
        strokeWidth={2}
      />
      <rect
        x={badgeLeft}
        y={y - 12}
        width={badgeWidth}
        height={22}
        rx={999}
        ry={999}
        fill="#ffffff"
        stroke="rgba(148, 163, 184, 0.42)"
      />
      <text
        x={layout.width / 2}
        y={y - 1}
        fill="#334155"
        fontFamily="IBM Plex Sans, Segoe UI, sans-serif"
        fontSize={11}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {step.label}
      </text>
    </g>
  );
}

function buildSequenceLayout(diagram: ParsedDiagram, width: number): SequenceLayout {
  const participantCount = Math.max(diagram.participants.length, 1);
  const usableWidth = width - SIDE_PADDING * 2;
  const compactWidth = usableWidth * HORIZONTAL_COMPACTNESS;
  const contentLeft = SIDE_PADDING + (usableWidth - compactWidth) / 2;
  const contentRight = width - contentLeft;
  const spacing =
    participantCount === 1 ? 0 : (contentRight - contentLeft) / (participantCount - 1);
  const participantBoxWidth = Math.min(180, Math.max(104, spacing * 0.74 || 140));
  const participants = diagram.participants.map((participant, index) => ({
    ...participant,
    x: participantCount === 1 ? width / 2 : contentLeft + index * spacing
  }));
  const stepYs = diagram.steps.map(
    (_, index) => HEADER_TOP + PARTICIPANT_BOX_HEIGHT + LIFELINE_TOP_GAP + STEP_GAP * (index + 1)
  );
  const lifelineTop = HEADER_TOP + PARTICIPANT_BOX_HEIGHT;
  const lifelineBottom = (stepYs[stepYs.length - 1] ?? lifelineTop + STEP_GAP) + FOOTER_GAP;
  const bottomBoxTop = lifelineBottom + BOTTOM_BOX_TOP_GAP;

  return {
    width,
    height: bottomBoxTop + PARTICIPANT_BOX_HEIGHT + 14,
    participantBoxWidth,
    participantBoxHeight: PARTICIPANT_BOX_HEIGHT,
    participants,
    stepYs,
    contentLeft,
    contentRight,
    lifelineTop,
    lifelineBottom,
    bottomBoxTop
  };
}

function buildHorizontalMessagePath(senderX: number, receiverX: number, y: number): string {
  const direction = senderX <= receiverX ? 1 : -1;
  return `M ${senderX} ${y} L ${receiverX - direction * 10} ${y}`;
}

function buildArrowHeadPoints(x: number, y: number, angle: number, size: number): string {
  const leftX = x - size * Math.cos(angle - Math.PI / 6);
  const leftY = y - size * Math.sin(angle - Math.PI / 6);
  const rightX = x - size * Math.cos(angle + Math.PI / 6);
  const rightY = y - size * Math.sin(angle + Math.PI / 6);
  return `${x},${y} ${leftX},${leftY} ${rightX},${rightY}`;
}

function computeMessageWidth(magnitude: number | undefined, maxMagnitude: number): number {
  if (magnitude == null || !Number.isFinite(magnitude) || maxMagnitude <= 0) {
    return 3;
  }
  const normalized = Math.abs(magnitude) / maxMagnitude;
  return 2.5 + normalized * 8.5;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let currentLine = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${currentLine} ${words[index]}`;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }
    lines.push(currentLine);
    currentLine = words[index];
  }

  lines.push(currentLine);
  return lines;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

function applyAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const normalized =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const red = Number.parseInt(normalized.slice(1, 3), 16);
    const green = Number.parseInt(normalized.slice(3, 5), 16);
    const blue = Number.parseInt(normalized.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  return color;
}
