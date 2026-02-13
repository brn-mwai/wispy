/**
 * Wispy CLI Banner - Ink component
 *
 * Responsive 3-size banner inside a rounded border box (like Copilot CLI):
 *  - Large  (>= 100 cols): Ghost side-by-side with info panel
 *  - Medium (60-99 cols):   Smaller ghost above compact info
 *  - Small  (< 60 cols):    Text-only with cloud icon
 *
 * Border and ghost color come from theme.primaryHex.
 */

import React from "react";
import { Box, Text } from "ink";
import { getTheme } from "../ui/theme.js";
import { WISPY_VERSION } from "../ui/banner.js";

// ── Ghost ASCII art ──────────────────────────────────────────

const LARGE_GHOST = [
  "    \u2584\u2588\u2588\u2588\u2588\u2584    ",
  "  \u2584\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2584  ",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588  \u2588\u2588  \u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "  \u2580\u2588\u2588\u2580\u2588\u2588\u2580\u2588\u2588\u2580  ",
];

const MEDIUM_GHOST = [
  "  \u2584\u2588\u2588\u2588\u2588\u2584  ",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  "\u2588\u2588\u2588 \u2588\u2588 \u2588\u2588\u2588",
  "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588",
  " \u2580\u2588\u2588\u2580\u2580\u2588\u2588\u2580 ",
];

// ── Helpers ──────────────────────────────────────────────────

interface BannerProps {
  model: string;
  provider: string;
  cwd: string;
  vertexai: boolean;
  channels?: string[];
}

function formatModel(model: string): string {
  return model
    .replace("gemini-", "Gemini ")
    .replace(/-preview.*$/, "")
    .replace("-pro", " Pro")
    .replace("-flash", " Flash");
}

function truncCwd(cwd: string, max: number): string {
  return cwd.length > max ? "..." + cwd.slice(-max) : cwd;
}

// ── Large Banner (>= 100 cols) ──────────────────────────────

function LargeBanner({ model, provider, cwd, vertexai, channels }: BannerProps) {
  const theme = getTheme();
  const color = theme.primaryHex;

  const version = `v${WISPY_VERSION}`;
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const displayModel = formatModel(model);
  const providerLabel = vertexai ? "Vertex AI" : displayModel;
  const shortCwd = truncCwd(cwd, 50);

  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      marginTop={1}
      marginBottom={1}
    >
      {/* Ghost logo - single solid color */}
      <Box flexDirection="column" marginRight={4}>
        {LARGE_GHOST.map((line, i) => (
          <Text key={`gl${i}`} color={color}>{line}</Text>
        ))}
      </Box>

      {/* Info panel */}
      <Box flexDirection="column">
        <Text>
          <Text bold color={color}>
            Wispy
          </Text>
          <Text dimColor>
            {" "}
            {version} {"\u00b7"} {time}
          </Text>
        </Text>
        <Text dimColor>{providerLabel}</Text>
        <Text dimColor>{shortCwd}</Text>
        {channels && channels.length > 0 && (
          <Text>
            <Text color="green">{"\u25CF"}</Text>
            <Text dimColor> Channels: {channels.join(", ")}</Text>
          </Text>
        )}
        <Text>{" "}</Text>
        <Text>
          <Text color="green">{"\u25CF"}</Text>
          <Text dimColor> SKALE BITE V2 | x402 + AP2 + BITE + DeFi</Text>
        </Text>
        <Text>
          <Text color={color}>{"\u2726"}</Text>
          <Text dimColor> /x402demo all -- run full hackathon demo</Text>
        </Text>
        <Text>
          <Text color={color}>{"\u2726"}</Text>
          <Text dimColor> Ctrl+E dashboard | Ctrl+O verbose | /help</Text>
        </Text>
      </Box>
    </Box>
  );
}

// ── Medium Banner (60-99 cols) ──────────────────────────────

function MediumBanner({ model, provider, cwd, vertexai, channels }: BannerProps) {
  const theme = getTheme();
  const color = theme.primaryHex;

  const version = `v${WISPY_VERSION}`;
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const displayModel = formatModel(model);
  const providerLabel = vertexai ? "Vertex AI" : displayModel;
  const shortCwd = truncCwd(cwd, 35);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      marginTop={1}
      marginBottom={1}
    >
      {/* Ghost centered - single solid color */}
      <Box flexDirection="column">
        {MEDIUM_GHOST.map((line, i) => (
          <Text key={`gm${i}`} color={color}>{line}</Text>
        ))}
      </Box>

      {/* Info below */}
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text bold color={color}>
            Wispy
          </Text>
          <Text dimColor>
            {" "}
            {version} {"\u00b7"} {time} {"\u00b7"} {providerLabel}
          </Text>
        </Text>
        <Text dimColor>
          {shortCwd} {"\u00b7"} SKALE BITE V2 {"\u00b7"} Ctrl+E dashboard
        </Text>
        {channels && channels.length > 1 && (
          <Text>
            <Text color="green">{"\u25CF"}</Text>
            <Text dimColor> {channels.join(", ")}</Text>
          </Text>
        )}
      </Box>
    </Box>
  );
}

// ── Small Banner (< 60 cols) ────────────────────────────────

function SmallBanner({ model, vertexai }: BannerProps) {
  const theme = getTheme();
  const color = theme.primaryHex;
  const displayModel = formatModel(model);
  const providerLabel = vertexai ? "Vertex AI" : displayModel;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={1}
      marginTop={1}
      marginBottom={1}
    >
      <Text>
        <Text bold color={color}>
          {"\u2601"} Wispy x402
        </Text>
        <Text dimColor> v{WISPY_VERSION}</Text>
      </Text>
      <Text dimColor>  {providerLabel}</Text>
    </Box>
  );
}

// ── Exported Banner ─────────────────────────────────────────

export function Banner(props: BannerProps) {
  const cols = process.stdout.columns || 80;

  if (cols >= 100) return <LargeBanner {...props} />;
  if (cols >= 60) return <MediumBanner {...props} />;
  return <SmallBanner {...props} />;
}
