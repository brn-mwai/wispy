/**
 * CommandPalette - Interactive slash command suggestions panel.
 *
 * Shows below the input when user types "/". Features:
 *   - Live filtering as user types (e.g. /mo -> /model, /models)
 *   - Arrow key navigation with highlighted selection
 *   - Tab/Enter to autocomplete the selected command
 *   - Grouped by category with dim headers
 *   - Command name + args on left, description on right
 *   - Thin separator line above the palette
 *
 * Inspired by GitHub Copilot CLI's slash command palette.
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import gradient from "gradient-string";
import { getTheme } from "../ui/theme.js";
import { filterCommands, type CommandDef } from "./command-registry.js";

const MAX_VISIBLE = 12; // Max commands shown before scrolling

interface CommandPaletteProps {
  /** The current input text (including the leading /) */
  input: string;
  /** Currently highlighted index (arrow key controlled) */
  selectedIndex: number;
}

export function CommandPalette({ input, selectedIndex }: CommandPaletteProps) {
  const theme = getTheme();

  // Extract query: "/mo" -> "mo", "/" -> ""
  const query = input.startsWith("/") ? input.slice(1) : "";

  const filtered = useMemo(() => filterCommands(query), [query]);

  if (filtered.length === 0) {
    return (
      <Box flexDirection="column" marginLeft={2}>
        <PaletteSeparator />
        <Text dimColor>  No matching commands</Text>
      </Box>
    );
  }

  // Calculate scroll window
  const total = filtered.length;
  const visible = Math.min(total, MAX_VISIBLE);
  let scrollStart = 0;
  if (total > MAX_VISIBLE) {
    // Keep selected item in view
    const clampedIdx = Math.max(0, Math.min(selectedIndex, total - 1));
    scrollStart = Math.max(0, Math.min(clampedIdx - Math.floor(visible / 2), total - visible));
  }
  const visibleCommands = filtered.slice(scrollStart, scrollStart + visible);

  // Find max command width for alignment
  const maxNameWidth = Math.max(
    ...visibleCommands.map((c) => {
      const aliasStr = c.aliases?.length ? `, /${c.aliases.join(", /")}` : "";
      const argsStr = c.args ? ` ${c.args}` : "";
      return `/${c.name}${aliasStr}${argsStr}`.length;
    }),
  );
  const colWidth = Math.min(maxNameWidth + 2, 35);

  // Group visible commands by category for headers
  let lastCategory = "";

  return (
    <Box flexDirection="column">
      <PaletteSeparator />
      {scrollStart > 0 && (
        <Text dimColor>  {"  \u25B2"} {scrollStart} more above</Text>
      )}
      {visibleCommands.map((cmd, i) => {
        const realIndex = scrollStart + i;
        const isSelected = realIndex === selectedIndex;
        const showCategory = cmd.category !== lastCategory;
        lastCategory = cmd.category;

        return (
          <React.Fragment key={cmd.name}>
            {showCategory && (
              <Box marginLeft={2} marginTop={i === 0 ? 0 : 0}>
                <Text dimColor bold>
                  {cmd.category}
                </Text>
              </Box>
            )}
            <CommandRow
              cmd={cmd}
              colWidth={colWidth}
              isSelected={isSelected}
              query={query}
            />
          </React.Fragment>
        );
      })}
      {scrollStart + visible < total && (
        <Text dimColor>  {"  \u25BC"} {total - scrollStart - visible} more below</Text>
      )}
    </Box>
  );
}

// ── Sub-components ───────────────────────────────────────────

function PaletteSeparator() {
  const theme = getTheme();
  const width = Math.min(process.stdout.columns || 80, 100);
  const g = gradient(theme.gradientAccent);
  const line = g("\u2500".repeat(width));
  return <Text>{line}</Text>;
}

interface CommandRowProps {
  cmd: CommandDef;
  colWidth: number;
  isSelected: boolean;
  query: string;
}

function CommandRow({ cmd, colWidth, isSelected, query }: CommandRowProps) {
  const aliasStr = cmd.aliases?.length
    ? `, /${cmd.aliases.join(", /")}`
    : "";
  const argsStr = cmd.args ? ` ${cmd.args}` : "";
  const nameStr = `/${cmd.name}${aliasStr}${argsStr}`;
  const padded = nameStr.padEnd(colWidth);

  return (
    <Box marginLeft={2}>
      {isSelected ? (
        <>
          <Text color="#31CCFF" bold>
            {"\u25B8"}{" "}
          </Text>
          <Text color="#31CCFF" bold>
            {padded}
          </Text>
          <Text>{cmd.description}</Text>
        </>
      ) : (
        <>
          <Text>{"  "}</Text>
          <CommandNameHighlighted name={nameStr} query={query} colWidth={colWidth} />
          <Text dimColor>{cmd.description}</Text>
        </>
      )}
    </Box>
  );
}

/**
 * Highlights the matching portion of the command name.
 * e.g. query="mo" on "/model" highlights "/mo" in accent color.
 */
function CommandNameHighlighted({
  name,
  query,
  colWidth,
}: {
  name: string;
  query: string;
  colWidth: number;
}) {
  if (!query) {
    return <Text color="#31CCFF">{name.padEnd(colWidth)}</Text>;
  }

  // The name starts with "/" so the match region is 1..1+query.length
  const matchEnd = 1 + query.length;
  const highlighted = name.slice(0, matchEnd);
  const rest = name.slice(matchEnd);
  const padded = (highlighted + rest).padEnd(colWidth);

  return (
    <Text>
      <Text color="#31CCFF" bold>
        {padded.slice(0, matchEnd)}
      </Text>
      <Text color="#31CCFF">
        {padded.slice(matchEnd)}
      </Text>
    </Text>
  );
}
