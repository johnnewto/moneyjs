#!/usr/bin/env python3
"""One-shot refactor: split app.css into domain partials with tokens and utilities."""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src/styles"
SOURCE_CSS = SRC / "_split_source.css"
OUT_DIR = SRC / "partials"
APP_CSS = SRC / "app.css"

DOMAIN_MAP: list[tuple[str, str]] = [
    (r"^\.notebook-matrix|^\.matrix-|^button\.notebook-matrix", "notebook-matrix"),
    (r"^\.notebook-model-view|^\.notebook-linked|^\.row-comment", "notebook-model-view"),
    (r"^\.notebook-", "notebook"),
    (r"^\.equation-grid|^\.external-grid|^\.initial-grid|^\.grid-editor", "grids"),
    (
        r"^\.equation-workspace|^\.equation-sidebar|^\.equation-list|^\.equation-detail|^\.equation-empty",
        "equation-workspace",
    ),
    (r"^\.assistant-|^\.chat-", "chat-assistant"),
    (r"^\.flow-|^\.matrix-multiport|^\.transaction-flow|^\.react-flow", "flow"),
    (r"^\.sequence-", "sequence"),
    (r"^\.stability-|^\.inspector-|^\.variable-inspector", "inspector"),
    (r"^\.scenario-", "scenario"),
    (r"^\.chart-|^\.result-", "results-charts"),
    (r"^\.solver-|^\.validation-|^\.import-|^\.error-", "misc-panels"),
    (
        r"^\.period-scrubber|^\.control-panel|^\.status-panel|^\.editor-panel|^\.result-panel|^\.field|^\.button-row|^\.editor-",
        "controls",
    ),
    (
        r"^\.workspace-|^\.panel-|^\.app-|^\.mode-|^\.hero-|^\.notebook-shell|^body\.",
        "layout",
    ),
    (
        r"^\.highlighted-formula|^\.formula-|^\.variable-math|^\.variable-label|^\.unit-badge|^\.equation-badge|^\.input-|^\.legend-item|^\.equation-unit-picker|^\.outline-index|^\.instant-tooltip|^\.numeric-|^\.variable-catalog|^\.variable-parameter|^\.parameter-slider|^\.pin-toggle|^\.grid-row-context|^\.popover|^\.secondary-button|^\.file-button|^\.option-grid|^\.checkbox-field|^\.shock-card|^\.json-area|^\.status-hint|^\.success-text|^\.meta-panel|^\.eyebrow|^\.panel-subtitle",
        "shared-components",
    ),
    (r"^@media", "responsive"),
    (r"^:root|^html|^body|^#root", "base"),
]

TOKEN_REPLACEMENTS: list[tuple[str, str]] = [
    ("#14213d", "var(--color-text)"),
    ("#0f172a", "var(--color-text-strong)"),
    ("#4b5563", "var(--color-text-muted)"),
    ("#475569", "var(--color-text-secondary)"),
    ("#64748b", "var(--color-text-subtle)"),
    ("#6b7280", "var(--color-muted-fg)"),
    ("#8d5b16", "var(--color-accent)"),
    ("#1d4ed8", "var(--color-link-active)"),
    ("#e2e8f0", "var(--color-grid-header-bg)"),
    ('"IBM Plex Sans", "Segoe UI", sans-serif', "var(--font-sans)"),
    ('"IBM Plex Serif", Georgia, serif', "var(--font-serif)"),
    ("ui-monospace, monospace", "var(--font-mono)"),
    ("rgba(20, 33, 61, 0.12)", "var(--color-border)"),
    ("rgba(20, 33, 61, 0.08)", "var(--color-border-faint)"),
    ("rgba(148, 163, 184, 0.28)", "var(--color-border-subtle)"),
    ("rgba(148, 163, 184, 0.18)", "var(--color-border-grid)"),
    ("rgba(141, 91, 22, 0.18)", "var(--color-border-accent)"),
    ("rgba(255, 255, 255, 0.82)", "var(--color-surface-soft)"),
    ("rgba(255, 255, 255, 0.92)", "var(--color-surface)"),
    ("rgba(255, 255, 255, 0.94)", "var(--color-surface-strong)"),
    ("rgba(255, 255, 255, 0.98)", "var(--color-surface-elevated)"),
    ("0 18px 50px rgba(20, 33, 61, 0.08)", "var(--shadow-header)"),
    ("0 16px 40px rgba(20, 33, 61, 0.06)", "var(--shadow-panel)"),
    ("0 18px 36px rgba(15, 23, 42, 0.14)", "var(--shadow-popover)"),
    ("0 8px 20px rgba(15, 23, 42, 0.1)", "var(--shadow-floating)"),
    ("border-radius: 999px", "border-radius: var(--radius-pill)"),
    ("border-radius: 24px", "border-radius: var(--radius-xl)"),
    ("border-radius: 20px", "border-radius: var(--radius-lg)"),
    ("border-radius: 14px", "border-radius: var(--radius-md)"),
    ("border-radius: 10px", "border-radius: var(--radius-sm)"),
    ("var(--muted-fg, #6b7280)", "var(--color-muted-fg)"),
    ("var(--font-mono, ui-monospace, monospace)", "var(--font-mono)"),
    ('var(--font-sans, "IBM Plex Sans", "Segoe UI", sans-serif)', "var(--font-sans)"),
    ("var(--font-mono, var(--font-mono))", "var(--font-mono)"),
]

UTILITY_ABSORBED: dict[str, set[str]] = {
    ".equation-grid-header": {
        "background",
        "color",
        "font-size",
        "font-weight",
        "letter-spacing",
        "text-transform",
    },
    ".external-grid-header": {
        "background",
        "color",
        "font-size",
        "font-weight",
        "letter-spacing",
        "text-transform",
    },
    ".initial-grid-header": {
        "background",
        "color",
        "font-size",
        "font-weight",
        "letter-spacing",
        "text-transform",
    },
    ".equation-grid-body": {"display"},
    ".external-grid-body": {"display"},
    ".initial-grid-body": {"display"},
}

SCROLLBAR_SELECTORS = (
    ".workspace-main",
    ".workspace-sidebar",
    ".notebook-main-column",
    ".notebook-outline",
)

UTILITY_BLOCK_PREFIXES = (
    ".control-panel,\n.status-panel",
    ".control-panel,",
    ".mode-switch-link,",
    ".app-kicker,",
    ".app-header p,",
)

BASE_BLOCK_PREFIXES = (
    ":root {",
    "html,",
    "body {",
)


def first_class_selector(selector: str) -> str:
    match = re.search(r"(?:^|[\s,>+~])([\.\#][\w-]+)", selector.replace("\n", " "))
    return match.group(1) if match else selector.strip().split(",")[0].strip()


def classify_selector(selector: str) -> str:
    first = first_class_selector(selector)
    for pattern, domain in DOMAIN_MAP:
        if re.match(pattern, first):
            return domain
    return "misc"


def parse_blocks(text: str) -> list[tuple[str, str]]:
    lines = text.splitlines(keepends=True)
    blocks: list[tuple[str, str]] = []
    i = 0
    n = len(lines)

    while i < n:
        stripped = lines[i].strip()
        if not stripped or stripped.startswith("/*"):
            i += 1
            continue

        if stripped.startswith("@media"):
            start = i
            brace = stripped.count("{") - stripped.count("}")
            i += 1
            while i < n and brace > 0:
                brace += lines[i].count("{") - lines[i].count("}")
                i += 1
            blocks.append(("responsive", "".join(lines[start:i])))
            continue

        start = i
        paren = 0
        found = False
        while i < n:
            line = lines[i]
            for ch in line:
                if ch == "(":
                    paren += 1
                elif ch == ")":
                    paren -= 1
            if "{" in line and paren == 0:
                brace = line.count("{") - line.count("}")
                i += 1
                while i < n and brace > 0:
                    brace += lines[i].count("{") - lines[i].count("}")
                    i += 1
                chunk = "".join(lines[start:i])
                domain = classify_selector(chunk.split("{", 1)[0])
                blocks.append((domain, chunk))
                found = True
                break
            i += 1
        if not found:
            raise RuntimeError(f"Unparsed CSS near line {start + 1}: {lines[start]!r}")

    return blocks


def apply_tokens(text: str) -> str:
    for old, new in TOKEN_REPLACEMENTS:
        text = text.replace(old, new)
    return text


def parse_rule_properties(body: str) -> dict[str, str]:
    props: dict[str, str] = {}
    for line in body.splitlines():
        s = line.strip()
        if not s or s.startswith("/*"):
            continue
        if ":" in s:
            key, _, val = s.partition(":")
            props[key.strip()] = val.rstrip(";").strip()
    return props


def strip_absorbed_properties(block: str) -> str | None:
    if "{" not in block:
        return block
    selector, rest = block.split("{", 1)
    selector = selector.strip()
    if selector not in UTILITY_ABSORBED:
        return block
    body = rest.rsplit("}", 1)[0]
    absorbed = UTILITY_ABSORBED[selector]
    props = parse_rule_properties(body)
    remaining = {k: v for k, v in props.items() if k not in absorbed}
    if not remaining:
        return None
    lines = [f"  {k}: {v};" for k, v in remaining.items()]
    return f"{selector} {{\n" + "\n".join(lines) + "\n}\n\n"


def is_scrollbar_block(block: str) -> bool:
    selector = block.split("{", 1)[0]
    return "::-webkit-scrollbar" in selector and any(s in selector for s in SCROLLBAR_SELECTORS)


def is_scrollbar_layout_block(block: str) -> bool:
    selector = block.split("{", 1)[0].strip()
    if "::-webkit-scrollbar" in selector:
        return False
    selectors = [s.strip() for s in selector.split(",")]
    scrollable = set(SCROLLBAR_SELECTORS)
    return scrollable.issubset(set(selectors)) and "height: 100%" in block


def is_utility_block(block: str) -> bool:
    head = block.split("{", 1)[0]
    return any(head.startswith(prefix) or prefix in block[:160] for prefix in UTILITY_BLOCK_PREFIXES)


def is_base_block(block: str) -> bool:
    stripped = block.strip()
    return any(stripped.startswith(prefix) for prefix in BASE_BLOCK_PREFIXES)


def main() -> None:
    if not SOURCE_CSS.exists():
        print(f"Missing {SOURCE_CSS}", file=sys.stderr)
        sys.exit(1)

    source = SOURCE_CSS.read_text()
    blocks = parse_blocks(source)

    by_domain: dict[str, list[str]] = defaultdict(list)
    for domain, block in blocks:
        if domain == "responsive":
            by_domain[domain].append(apply_tokens(block))
            continue
        if domain == "base" or is_base_block(block):
            continue
        if is_scrollbar_block(block) or is_scrollbar_layout_block(block) or is_utility_block(block):
            continue
        trimmed = strip_absorbed_properties(block)
        if trimmed is None:
            continue
        by_domain[domain].append(apply_tokens(trimmed))

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    domain_files = {
        "layout": "layout.css",
        "controls": "controls.css",
        "chat-assistant": "chat-assistant.css",
        "equation-workspace": "equation-workspace.css",
        "grids": "grids.css",
        "shared-components": "shared-components.css",
        "results-charts": "results-charts.css",
        "inspector": "inspector.css",
        "scenario": "scenario.css",
        "flow": "flow.css",
        "sequence": "sequence.css",
        "notebook": "notebook.css",
        "notebook-matrix": "notebook-matrix.css",
        "notebook-model-view": "notebook-model-view.css",
        "misc-panels": "misc-panels.css",
        "misc": "misc.css",
        "responsive": "responsive.css",
    }

    static_files = {"tokens.css", "utilities.css", "base.css"}

    for domain, filename in domain_files.items():
        content = "".join(by_domain.get(domain, []))
        path = OUT_DIR / filename
        if not content.strip():
            if path.exists() and filename not in static_files:
                path.unlink()
            continue
        header = f"/* {domain.replace('-', ' ').title()} styles */\n\n"
        path.write_text(header + content)

    import_order = [
        "tokens.css",
        "utilities.css",
        "base.css",
        "layout.css",
        "controls.css",
        "chat-assistant.css",
        "equation-workspace.css",
        "grids.css",
        "shared-components.css",
        "results-charts.css",
        "inspector.css",
        "scenario.css",
        "flow.css",
        "sequence.css",
        "notebook.css",
        "notebook-matrix.css",
        "notebook-model-view.css",
        "misc-panels.css",
        "misc.css",
        "responsive.css",
    ]

    imports = "\n".join(
        f'@import "./partials/{name}";'
        for name in import_order
        if (OUT_DIR / name).exists()
    )
    APP_CSS.write_text(
        "/* SFCR application styles — split by domain. See partials/ for source files. */\n\n"
        + imports
        + "\n"
    )

    print(f"Parsed {len(blocks)} blocks into {len(list(OUT_DIR.glob('*.css')))} partials")


if __name__ == "__main__":
    main()
