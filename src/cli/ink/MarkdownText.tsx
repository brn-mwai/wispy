/**
 * MarkdownText - Renders agent responses in Claude Code style.
 *
 * Converts markdown to clean terminal output:
 *   - Headers become bold colored text (no raw ## symbols)
 *   - Bullets use filled/hollow circles
 *   - Code spans get subtle background highlighting
 *   - Code blocks are indented with dim border
 *   - Tables rendered with box-drawing borders and header highlighting
 *   - Links rendered in cyan, addresses in cyan, costs in yellow
 *   - Bold/italic rendered natively
 *   - No raw markdown symbols visible to the user
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { getTheme } from "../ui/theme.js";

interface MarkdownTextProps {
  children: string;
}

// ── Table Renderer ──────────────────────────────────────────────

function renderTable(
  rows: string[][],
  hasHeader: boolean,
  keyBase: number,
  color: string,
): React.ReactNode {
  if (rows.length === 0) return null;

  // Normalize column count
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    const padded = [...r];
    while (padded.length < colCount) padded.push("");
    return padded;
  });

  // Compute max width per column
  const colWidths = Array.from({ length: colCount }, (_, ci) =>
    Math.max(3, ...normalized.map((r) => r[ci].length)),
  );

  // Build border strings
  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const topBorder =
    "\u250C" +
    colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u252C") +
    "\u2510";
  const midBorder =
    "\u251C" +
    colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u253C") +
    "\u2524";
  const botBorder =
    "\u2514" +
    colWidths.map((w) => "\u2500".repeat(w + 2)).join("\u2534") +
    "\u2518";

  const renderRow = (
    cells: string[],
    isHeader: boolean,
    key: string,
  ): React.ReactNode => (
    <Text key={key}>
      {"  "}
      <Text dimColor>{"\u2502"}</Text>
      {cells.map((cell, ci) => (
        <React.Fragment key={ci}>
          {isHeader ? (
            <Text bold color={color}>
              {" "}
              {pad(cell, colWidths[ci])}{" "}
            </Text>
          ) : (
            <Text>
              {" "}
              {pad(cell, colWidths[ci])}{" "}
            </Text>
          )}
          <Text dimColor>{"\u2502"}</Text>
        </React.Fragment>
      ))}
    </Text>
  );

  const elements: React.ReactNode[] = [];

  // Top border
  elements.push(
    <Text key={`tb${keyBase}`} dimColor>
      {"  "}
      {topBorder}
    </Text>,
  );

  // Header row(s)
  if (hasHeader && normalized.length > 0) {
    elements.push(renderRow(normalized[0], true, `th${keyBase}`));
    elements.push(
      <Text key={`tm${keyBase}`} dimColor>
        {"  "}
        {midBorder}
      </Text>,
    );
    // Body rows
    for (let i = 1; i < normalized.length; i++) {
      elements.push(renderRow(normalized[i], false, `tr${keyBase}_${i}`));
    }
  } else {
    // No header distinction -- all rows same style
    for (let i = 0; i < normalized.length; i++) {
      elements.push(renderRow(normalized[i], false, `tr${keyBase}_${i}`));
    }
  }

  // Bottom border
  elements.push(
    <Text key={`bb${keyBase}`} dimColor>
      {"  "}
      {botBorder}
    </Text>,
  );

  return (
    <Box key={`tbl${keyBase}`} flexDirection="column">
      {elements}
    </Box>
  );
}

// ── Main Converter ──────────────────────────────────────────────

function markdownToElements(raw: string, color: string): React.ReactNode[] {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  // Table accumulator
  let tableRows: string[][] = [];
  let tableHasHeader = false;

  const flushTable = (idx: number) => {
    if (tableRows.length > 0) {
      const node = renderTable(tableRows, tableHasHeader, idx, color);
      if (node) elements.push(node);
      tableRows = [];
      tableHasHeader = false;
    }
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // ── Code block fences ──
    if (line.trimStart().startsWith("```")) {
      flushTable(idx);
      if (inCodeBlock) {
        elements.push(
          <Box
            key={`cb${idx}`}
            flexDirection="column"
            marginLeft={1}
            marginTop={0}
            marginBottom={0}
          >
            {codeBlockLang && <Text dimColor>  {codeBlockLang}</Text>}
            {codeBlockLines.map((cl, ci) => (
              <Text key={ci} dimColor>
                <Text color={color}>{"\u2502"}</Text> {cl}
              </Text>
            ))}
          </Box>,
        );
        codeBlockLines = [];
        codeBlockLang = "";
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // ── Table rows ──
    if (line.includes("|") && line.trim().startsWith("|")) {
      // Separator row like |---|---|
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        tableHasHeader = true;
        continue;
      }
      const cells = line
        .split("|")
        .filter((c) => c.trim())
        .map((c) => c.trim());
      if (cells.length > 0) tableRows.push(cells);
      continue;
    }

    // If we were accumulating table rows, flush them
    flushTable(idx);

    // ── Blank lines ──
    if (!line.trim()) {
      elements.push(<Text key={`bl${idx}`}>{" "}</Text>);
      continue;
    }

    // ── Headers (# ## ### etc) ──
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      elements.push(
        <Text key={`h${idx}`} bold color={color}>
          {formatInline(headerMatch[2], color)}
        </Text>,
      );
      continue;
    }

    // ── Unordered list items ──
    const ulMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/);
    if (ulMatch) {
      const depth = Math.floor(ulMatch[1].length / 2);
      const bullet = depth === 0 ? "\u25CF" : "\u25CB";
      const indent = "  ".repeat(depth);
      elements.push(
        <Text key={`ul${idx}`}>
          {indent}
          <Text color={color}>{bullet}</Text> {formatInline(ulMatch[2], color)}
        </Text>,
      );
      continue;
    }

    // ── Ordered list items ──
    const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (olMatch) {
      const depth = Math.floor(olMatch[1].length / 2);
      const indent = "  ".repeat(depth);
      elements.push(
        <Text key={`ol${idx}`}>
          {indent}
          <Text color={color}>{"\u25CF"}</Text> {formatInline(olMatch[2], color)}
        </Text>,
      );
      continue;
    }

    // ── Blockquotes ──
    const bqMatch = line.match(/^>\s?(.*)$/);
    if (bqMatch) {
      elements.push(
        <Text key={`bq${idx}`}>
          <Text color={color}>{"\u2502"}</Text>{" "}
          <Text dimColor>{formatInline(bqMatch[1], color)}</Text>
        </Text>,
      );
      continue;
    }

    // ── Horizontal rules ──
    if (/^[-*_]{3,}\s*$/.test(line)) {
      continue;
    }

    // ── Regular paragraph text ──
    elements.push(
      <Text key={`p${idx}`}>{formatInline(line, color)}</Text>,
    );
  }

  // Flush any remaining table
  flushTable(lines.length);

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <Box key="cb_unclosed" flexDirection="column" marginLeft={1}>
        {codeBlockLines.map((cl, ci) => (
          <Text key={ci} dimColor>
            <Text color={color}>{"\u2502"}</Text> {cl}
          </Text>
        ))}
      </Box>,
    );
  }

  return elements;
}

// ── Inline Formatter ────────────────────────────────────────────

/**
 * Format inline markdown: **bold**, *italic*, `code`, [links](url),
 * plus semantic coloring for URLs, hex addresses, and costs.
 */
function formatInline(text: string, _color: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partIdx = 0;

  while (remaining.length > 0) {
    // Bold: **text** or __text__
    const boldMatch =
      remaining.match(/^(.*?)\*\*(.+?)\*\*/s) ||
      remaining.match(/^(.*?)__(.+?)__/s);
    // Code span: `text`
    const codeMatch = remaining.match(/^(.*?)`([^`]+)`/);
    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^(.*?)\*([^*]+)\*/);
    // Link: [text](url)
    const linkMatch = remaining.match(/^(.*?)\[([^\]]+)\]\(([^)]+)\)/);
    // Bare URL: https://...
    const urlMatch = remaining.match(/^(.*?)(https?:\/\/\S+)/);
    // Hex address: 0x followed by 8+ hex chars
    const hexMatch = remaining.match(/^(.*?)(0x[a-fA-F0-9]{8,})/);
    // Cost: $amount
    const costMatch = remaining.match(/^(.*?)(\$[\d,.]+)/);

    // Find earliest match
    type Match = {
      type: string;
      match: RegExpMatchArray;
      pos: number;
    };
    const candidates: Match[] = [];
    if (boldMatch && boldMatch[1] !== undefined)
      candidates.push({ type: "bold", match: boldMatch, pos: boldMatch[1].length });
    if (codeMatch && codeMatch[1] !== undefined)
      candidates.push({ type: "code", match: codeMatch, pos: codeMatch[1].length });
    if (italicMatch && italicMatch[1] !== undefined)
      candidates.push({ type: "italic", match: italicMatch, pos: italicMatch[1].length });
    if (linkMatch && linkMatch[1] !== undefined)
      candidates.push({ type: "link", match: linkMatch, pos: linkMatch[1].length });
    if (urlMatch && urlMatch[1] !== undefined)
      candidates.push({ type: "url", match: urlMatch, pos: urlMatch[1].length });
    if (hexMatch && hexMatch[1] !== undefined)
      candidates.push({ type: "hex", match: hexMatch, pos: hexMatch[1].length });
    if (costMatch && costMatch[1] !== undefined)
      candidates.push({ type: "cost", match: costMatch, pos: costMatch[1].length });

    if (candidates.length === 0) {
      if (remaining) parts.push(remaining);
      break;
    }

    // Pick the earliest match
    candidates.sort((a, b) => a.pos - b.pos);
    const best = candidates[0];
    const before = best.match[1];

    if (before) {
      parts.push(before);
    }

    const key = `i${partIdx++}`;
    switch (best.type) {
      case "bold":
        parts.push(
          <Text key={key} bold>
            {best.match[2]}
          </Text>,
        );
        break;
      case "code":
        parts.push(
          <Text key={key} color="#E8912D">
            {best.match[2]}
          </Text>,
        );
        break;
      case "italic":
        parts.push(
          <Text key={key} italic>
            {best.match[2]}
          </Text>,
        );
        break;
      case "link":
        parts.push(
          <Text key={key} color="cyan" underline>
            {best.match[2]}
          </Text>,
        );
        break;
      case "url":
        parts.push(
          <Text key={key} color="cyan" underline>
            {best.match[2]}
          </Text>,
        );
        break;
      case "hex":
        parts.push(
          <Text key={key} color="cyan">
            {best.match[2]}
          </Text>,
        );
        break;
      case "cost":
        parts.push(
          <Text key={key} color="yellow" bold>
            {best.match[2]}
          </Text>,
        );
        break;
    }

    remaining = remaining.slice(best.match[0].length);
  }

  if (parts.length === 0) return text;
  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  return <>{parts}</>;
}

// ── Component ───────────────────────────────────────────────────

export function MarkdownText({ children }: MarkdownTextProps) {
  const theme = getTheme();
  const color = theme.primaryHex;

  const elements = useMemo(
    () => markdownToElements(children, color),
    [children, color],
  );

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={1}>
      {elements}
    </Box>
  );
}
