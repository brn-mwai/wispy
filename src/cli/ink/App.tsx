/**
 * Wispy CLI - Root Ink Application
 *
 * Manages conversation state, streaming, tool calls, and input.
 * Uses Ink's Static component for completed messages (never re-rendered)
 * and a dynamic area for current activity (thinking spinner, streaming text).
 *
 * Features:
 *   - Slash command palette with live filtering (type / to activate)
 *   - Arrow key navigation + Tab/Enter to autocomplete commands
 *   - Markdown-rendered responses
 *   - Streaming with cursor indicator
 *   - Ctrl+C to cancel / exit
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import { Banner } from "./Banner.js";
import { ToolCall, ToolResult } from "./ToolCall.js";
import { ThinkingSpinner } from "./ThinkingSpinner.js";
import { StatsLine } from "./StatsLine.js";
import { Separator } from "./Separator.js";
import { MarkdownText } from "./MarkdownText.js";
import { filterCommands } from "./command-registry.js";
import { existsSync, readFileSync } from "fs";
import { extname } from "path";
import gradient from "gradient-string";
import { getTheme } from "../ui/theme.js";
import type { HistoryEntry, NewHistoryEntry } from "./types.js";
import type { Agent } from "../../core/agent.js";
import type { SessionType } from "../../security/isolation.js";
import type { TokenManager } from "../../token/estimator.js";
import type { CommandDef } from "./command-registry.js";
import { onChannelEvent } from "../../channels/dock.js";

// ── Props ────────────────────────────────────────────────────────

interface AppProps {
  agent: Agent;
  config: any;
  tokenManager: TokenManager;
  vertexEnabled: boolean;
  runtimeDir: string;
  soulDir: string;
  connectedChannels?: string[];
  marathonService?: any;
}

// ── ID generator ─────────────────────────────────────────────────

let _id = 0;
const nextId = () => String(++_id);

// ── Constants ────────────────────────────────────────────────────

const MAX_PALETTE_VISIBLE = 12;

// ── Image extraction ────────────────────────────────────────────
// Detects image file paths in user input, loads them as base64,
// and strips the paths from the text.

interface ImagePart {
  mimeType: string;
  data: string;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

function extractImages(input: string): { text: string; images: ImagePart[] } {
  const images: ImagePart[] = [];
  const pathRegex = /(?:[A-Za-z]:[\\\/]|[~.\/\\])[\w\-. \\\/]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg)/gi;
  const matches = input.match(pathRegex) || [];

  let text = input;
  for (const match of matches) {
    const ext = extname(match).toLowerCase();
    if (IMAGE_EXTS.has(ext) && existsSync(match)) {
      try {
        const data = readFileSync(match).toString("base64");
        images.push({ mimeType: MIME_MAP[ext] || "image/png", data });
        text = text.replace(match, "").trim();
      } catch {
        // skip unreadable files
      }
    }
  }

  if (!text && images.length > 0) text = "Describe this image.";
  return { text, images };
}

// ── History Item Renderer ────────────────────────────────────────

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const theme = getTheme();
  const color = theme.primaryHex;

  switch (entry.type) {
    case "banner":
      return (
        <Banner
          model={entry.model}
          provider={entry.provider}
          cwd={entry.cwd}
          vertexai={entry.vertexai}
          channels={entry.channels}
        />
      );

    case "separator":
      return <Separator />;

    case "user-input":
      return (
        <Box marginTop={1}>
          <Text bold color={color}>
            {"\u276F"}{" "}
          </Text>
          <Text bold>{entry.text}</Text>
        </Box>
      );

    case "tool-call":
      return <ToolCall data={entry.data} />;

    case "tool-result":
      return <ToolResult data={entry.data} />;

    case "thinking":
      return (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text dimColor color="#8B8B8B">
            {"\u2726"} Thinking
          </Text>
          <Box marginLeft={4}>
            <Text dimColor>{entry.text.slice(-500)}</Text>
          </Box>
        </Box>
      );

    case "response":
      return <MarkdownText>{entry.text}</MarkdownText>;

    case "stats":
      return <StatsLine data={entry.data} />;

    case "error":
      return (
        <Box marginLeft={2}>
          <Text color="red">{"\u25CF"} {entry.message}</Text>
        </Box>
      );

    case "context-compacted":
      return (
        <Box marginLeft={2}>
          <Text dimColor>{"  \u27F3"} Context auto-compacted</Text>
        </Box>
      );

    case "image-attached":
      return (
        <Box marginLeft={2}>
          <Text dimColor>
            {"  \u25C6"} {entry.count} image(s) attached
          </Text>
        </Box>
      );

    case "cross-channel":
      return (
        <Box marginLeft={2} marginTop={1}>
          <Text color="cyan" bold>{"\u25C6"} </Text>
          <Text dimColor>[{entry.source}] </Text>
          <Text italic>{entry.isVoice ? "\uD83C\uDF99 " : ""}{entry.text}</Text>
        </Box>
      );

    case "marathon-progress": {
      const icons: Record<string, string> = {
        started: "\uD83D\uDE80",
        milestone_started: "\uD83D\uDCCD",
        milestone_completed: "\u2705",
        milestone_failed: "\u274C",
        completed: "\uD83C\uDFC1",
        approval_needed: "\u26A0\uFE0F",
      };
      const icon = icons[entry.event] || "\uD83D\uDCE2";
      const bar = entry.total > 0
        ? ` [${"=".repeat(Math.round((entry.progress / entry.total) * 20))}${"-".repeat(20 - Math.round((entry.progress / entry.total) * 20))}] ${entry.progress}/${entry.total}`
        : "";
      return (
        <Box marginLeft={2} marginTop={entry.event === "started" || entry.event === "completed" ? 1 : 0}>
          <Text color={entry.event.includes("fail") ? "red" : entry.event === "completed" ? "green" : "yellow"}>
            {icon} </Text>
          <Text bold={entry.event === "started" || entry.event === "completed"}>
            {entry.milestone || entry.event.replace(/_/g, " ")}
          </Text>
          <Text dimColor>{bar}</Text>
        </Box>
      );
    }

    case "x402-dashboard": {
      const d = entry.data;
      const spentPct = d.dailyLimit > 0 ? Math.min(100, (d.dailySpent / d.dailyLimit) * 100) : 0;
      const barLen = 20;
      const filled = Math.round((spentPct / 100) * barLen);
      const budgetBar = "\u2588".repeat(filled) + "\u2591".repeat(barLen - filled);

      return (
        <Box flexDirection="column" marginTop={1} marginBottom={1} borderStyle="round" borderColor="#00FFA3" paddingX={2} paddingY={1}>
          <Text bold color="#00FFA3">{"\uD83D\uDCB3"} x402 Transaction Dashboard</Text>
          <Text dimColor>{"=".repeat(44)}</Text>
          <Text><Text bold>Wallet:  </Text><Text color="cyan">{d.walletAddress}</Text></Text>
          <Text><Text bold>Explorer:</Text> <Text dimColor>{d.explorerUrl}/address/{d.walletAddress.startsWith("0x") ? d.walletAddress : ""}</Text></Text>
          <Text><Text bold>USDC:    </Text><Text color="green">${d.usdcBalance}</Text></Text>
          <Text><Text bold>Network: </Text><Text dimColor>SKALE BITE V2 Sandbox (Chain 103698795)</Text></Text>
          <Text>{" "}</Text>
          <Text bold>Daily Budget</Text>
          <Text>  Spent:     ${d.dailySpent.toFixed(6)} / ${d.dailyLimit.toFixed(2)}</Text>
          <Box>
            <Text>  </Text>
            <Text color={spentPct > 80 ? "red" : "green"}>{budgetBar}</Text>
            <Text dimColor> {spentPct.toFixed(0)}%</Text>
          </Box>
          <Text>  Remaining: <Text color="green">${d.budgetRemaining.toFixed(6)}</Text></Text>
          {d.recentPayments.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Recent Payments</Text>
              <Text dimColor>  {"Service".padEnd(25)} {"Amount".padEnd(12)} {"Tx Hash".padEnd(18)} Status</Text>
              {d.recentPayments.slice(-5).map((p, i) => (
                <Text key={`xp${i}`} dimColor>
                  {"  "}{p.service.slice(0, 24).padEnd(25)} ${p.amount.toFixed(6).padEnd(11)} {(p.txHash ? p.txHash.slice(0, 14) + "..." : "pending").padEnd(18)} {p.status}
                </Text>
              ))}
            </Box>
          )}
          {d.recentPayments.length === 0 && (
            <Text dimColor>{"\n"}  No payments recorded yet. Run /x402demo to start.</Text>
          )}
        </Box>
      );
    }

    case "x402-payment": {
      const p = entry.data;
      return (
        <Box marginLeft={2}>
          <Text color="#00FFA3">{"\u25C6"} </Text>
          <Text>x402: </Text>
          <Text bold>{p.service}</Text>
          <Text dimColor> | ${p.amount.toFixed(6)} USDC | </Text>
          <Text color="cyan">{p.explorerLink}</Text>
        </Box>
      );
    }

    case "verbose-toggle":
      return (
        <Box marginLeft={2} marginTop={1}>
          <Text color={entry.enabled ? "#00FFA3" : "yellow"}>
            {entry.enabled ? "\u25CF" : "\u25CB"} x402 verbose mode: {entry.enabled ? "ON" : "OFF"}
          </Text>
          <Text dimColor> {entry.enabled ? "-- showing full payment details" : "-- compact view"}</Text>
        </Box>
      );

    default:
      return null;
  }
}

// ── Inline Palette Rows ──────────────────────────────────────────
// Rendered directly in App to avoid dynamic-mount issues with Ink.

function PaletteRow({
  cmd,
  colWidth,
  isSelected,
  query,
  color,
}: {
  cmd: CommandDef;
  colWidth: number;
  isSelected: boolean;
  query: string;
  color: string;
}) {
  const aliasStr = cmd.aliases?.length
    ? `, /${cmd.aliases.join(", /")}`
    : "";
  const argsStr = cmd.args ? ` ${cmd.args}` : "";
  const nameStr = `/${cmd.name}${aliasStr}${argsStr}`;
  const padded = nameStr.padEnd(colWidth);

  if (isSelected) {
    return (
      <Box marginLeft={2}>
        <Text color={color} bold>
          {"\u25B8"}{" "}
        </Text>
        <Text color={color} bold>
          {padded}
        </Text>
        <Text> {cmd.description}</Text>
      </Box>
    );
  }

  // Highlight matched prefix
  if (query) {
    const matchEnd = 1 + query.length;
    return (
      <Box marginLeft={2}>
        <Text>{"  "}</Text>
        <Text color={color} bold>
          {padded.slice(0, matchEnd)}
        </Text>
        <Text color={color} dimColor>
          {padded.slice(matchEnd)}
        </Text>
        <Text dimColor> {cmd.description}</Text>
      </Box>
    );
  }

  return (
    <Box marginLeft={2}>
      <Text>{"  "}</Text>
      <Text color={color}>{padded}</Text>
      <Text dimColor> {cmd.description}</Text>
    </Box>
  );
}

// ── Hints Bar ───────────────────────────────────────────────────
// Shows below the bottom separator when the palette is not open.
// Left: keyboard shortcuts, Right: stats (model · tokens · cost · context bar · time · backend)

function HintsBar({ cols, stats }: { cols: number; stats?: import("./types.js").StatsData | null }) {
  const left = " ctrl+c cancel  ctrl+o verbose  ctrl+e x402";

  if (!stats) {
    const right = "/ commands";
    const gap = Math.max(1, cols - left.length - right.length);
    return (
      <Box>
        <Text dimColor>{left}</Text>
        <Text>{" ".repeat(gap)}</Text>
        <Text dimColor>{right}</Text>
      </Box>
    );
  }

  // Build context progress bar
  const barWidth = 10;
  const filled = Math.min(barWidth, Math.round((stats.contextPercent / 100) * barWidth));
  const empty = barWidth - filled;
  const barFilled = "\u2588".repeat(filled);
  const barEmpty = "\u2591".repeat(empty);

  // Calculate right side length for gap spacing
  const rightText = [
    stats.model,
    `${stats.tokens.toLocaleString()} tk`,
    `$${stats.cost.toFixed(4)}`,
    `${barFilled}${barEmpty} ${stats.contextPercent}%`,
    `${stats.elapsed}s`,
    ...(stats.mode && stats.mode !== "chat" ? [`[${stats.mode}]`] : []),
    ...(stats.backend ? [`[${stats.backend}]`] : []),
  ].join(" \u00b7 ");

  const gap = Math.max(1, cols - left.length - rightText.length);

  return (
    <Box>
      <Text dimColor>{left}</Text>
      <Text>{" ".repeat(gap)}</Text>
      <Text color="#7B61FF">{stats.model}</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="#FFB74D">{stats.tokens.toLocaleString()} tk</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="#4CAF50">${stats.cost.toFixed(4)}</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="green">{barFilled}</Text>
      <Text dimColor>{barEmpty} {stats.contextPercent}%</Text>
      <Text dimColor> {"\u00b7"} </Text>
      <Text color="#FF7F50">{stats.elapsed}s</Text>
      {stats.mode && stats.mode !== "chat" && (
        <Text dimColor> {"\u00b7"} <Text color="yellow">[{stats.mode}]</Text></Text>
      )}
      {stats.backend && (
        <Text dimColor> {"\u00b7"} <Text color="green">[{stats.backend}]</Text></Text>
      )}
    </Box>
  );
}

// ── Main App ─────────────────────────────────────────────────────

export function App({
  agent,
  config,
  tokenManager,
  vertexEnabled,
  runtimeDir,
  soulDir,
  connectedChannels,
  marathonService,
}: AppProps) {
  const { exit } = useApp();

  // ── Session state ──
  const [currentSession, setCurrentSession] = useState("main");

  // ── History (Static items) ──
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      id: nextId(),
      type: "banner",
      model: config.gemini.models.pro,
      provider: vertexEnabled ? "Vertex AI" : config.gemini.models.pro,
      cwd: process.cwd(),
      vertexai: vertexEnabled,
      channels: connectedChannels,
    },
  ]);

  // ── Input state ──
  const [input, setInput] = useState("");

  // ── Command palette state ──
  const [paletteIndex, setPaletteIndex] = useState(0);

  // ── Processing state ──
  const [isProcessing, setIsProcessing] = useState(false);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [thinkingText, setThinkingText] = useState("");
  const thinkingTextRef = useRef("");

  // ── Last stats (shown above input, not in history) ──
  const [lastStats, setLastStats] = useState<import("./types.js").StatsData | null>(null);

  // ── x402 verbose mode ──
  const [verboseMode, setVerboseMode] = useState(false);

  // ── Refs ──
  const abortRef = useRef<AbortController | null>(null);
  const thinkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkStartRef = useRef(0);

  // ── Derived state ──
  const showPalette = !isProcessing && input.startsWith("/");
  const paletteQuery = showPalette ? input.slice(1).split(" ")[0] : "";
  const filteredCommands = useMemo(
    () => (showPalette ? filterCommands(paletteQuery) : []),
    [showPalette, paletteQuery],
  );

  // Check if input exactly matches a command (ready to execute)
  const hasExactMatch = useMemo(() => {
    if (!showPalette) return false;
    const q = paletteQuery.toLowerCase();
    return filteredCommands.some(
      (c) => c.name === q || (c.aliases?.includes(q) ?? false),
    );
  }, [showPalette, paletteQuery, filteredCommands]);

  // ── Helpers ──

  const addEntry = useCallback(
    (entry: NewHistoryEntry) => {
      setHistory((h) => [...h, { ...entry, id: nextId() } as HistoryEntry]);
    },
    [],
  );

  // ── Cross-channel event listener (voice sync, etc.) ──
  useEffect(() => {
    const unsubscribe = onChannelEvent("cli", (event) => {
      if (event.type === "message" && event.source !== "cli") {
        const data = event.data as { text?: string; isVoice?: boolean };
        if (data.text) {
          setHistory((h) => [
            ...h,
            {
              id: nextId(),
              type: "cross-channel" as const,
              source: event.source,
              text: data.text!,
              isVoice: data.isVoice,
            },
          ]);
        }
      }
      if (event.type === "notification" && event.source !== "cli") {
        const data = event.data as { text?: string; isResponse?: boolean };
        if (data.isResponse && data.text) {
          setHistory((h) => [
            ...h,
            { id: nextId(), type: "response" as const, text: data.text! },
          ]);
        }
      }
    });
    return unsubscribe;
  }, []);

  // ── Marathon event listener (live progress in CLI) ──
  useEffect(() => {
    const svc = marathonService;
    if (!svc || !svc.onEvent) return;

    const unsubscribe = svc.onEvent((event: any) => {
      const data = event.data as Record<string, unknown>;
      const milestone = (data?.milestone as string) || "";
      const eventType = event.type as string;

      // Only show significant events
      if (["milestone_started", "milestone_completed", "milestone_failed", "started", "completed", "approval_needed"].includes(eventType)) {
        setHistory((h) => [
          ...h,
          {
            id: nextId(),
            type: "marathon-progress" as const,
            event: eventType,
            milestone,
            progress: event.progress?.completed ?? 0,
            total: event.progress?.total ?? 0,
          },
        ]);
      }
    });

    return unsubscribe;
  }, [marathonService]);

  const stopThinking = useCallback(() => {
    if (thinkTimerRef.current) {
      clearInterval(thinkTimerRef.current);
      thinkTimerRef.current = null;
    }
    setThinkingElapsed(0);
  }, []);

  const startThinking = useCallback(() => {
    stopThinking();
    thinkStartRef.current = Date.now();
    thinkTimerRef.current = setInterval(() => {
      setThinkingElapsed(
        (Date.now() - thinkStartRef.current) / 1000,
      );
    }, 100);
  }, [stopThinking]);

  // ── Autocomplete helper ──

  const autocompleteSelected = useCallback(() => {
    if (filteredCommands.length === 0) return false;
    const idx = Math.min(paletteIndex, filteredCommands.length - 1);
    const selected = filteredCommands[idx];
    if (!selected) return false;
    const suffix = selected.args ? " " : "";
    setInput(`/${selected.name}${suffix}`);
    setPaletteIndex(0);
    return true;
  }, [filteredCommands, paletteIndex]);

  // ── Input change handler ──

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
    setPaletteIndex(0);
  }, []);

  // ── Keyboard shortcuts ──

  useInput((_ch, key) => {
    // Ctrl+C: cancel stream or exit
    if (key.ctrl && _ch === "c") {
      if (abortRef.current) {
        abortRef.current.abort();
        stopThinking();
        setIsProcessing(false);
        setStreamingText("");
      } else {
        exit();
      }
      return;
    }

    // Ctrl+O: toggle verbose x402 mode
    if (key.ctrl && _ch === "o") {
      const next = !verboseMode;
      setVerboseMode(next);
      addEntry({
        type: "verbose-toggle" as const,
        enabled: next,
      });
      return;
    }

    // Ctrl+E: show x402 transaction dashboard
    if (key.ctrl && _ch === "e") {
      (async () => {
        try {
          const { SKALE_BITE_SANDBOX } = await import("../../integrations/agentic-commerce/config.js");
          const explorerUrl = SKALE_BITE_SANDBOX.explorerUrl;
          const walletAddr = process.env.AGENT_WALLET_ADDRESS || "Not configured -- set AGENT_PRIVATE_KEY";

          // Try to read commerce ledger for spend data
          let dailySpent = 0;
          let dailyLimit = 10.0;
          let recentPayments: import("./types.js").X402DashboardData["recentPayments"] = [];

          try {
            const { readFileSync } = await import("fs");
            const { join } = await import("path");
            const ledgerPath = join(runtimeDir, "wallet", "commerce-ledger.json");
            const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8"));
            if (ledger.payments && Array.isArray(ledger.payments)) {
              for (const p of ledger.payments.slice(-10)) {
                dailySpent += p.amount || 0;
                recentPayments.push({
                  service: p.service || p.url || "unknown",
                  amount: p.amount || 0,
                  txHash: p.txHash || "",
                  status: p.status || "settled",
                  timestamp: p.timestamp || "",
                });
              }
            }
          } catch {
            // No ledger file yet -- show empty
          }

          // Try to read wallet balance
          let usdcBalance = "0.000000";
          try {
            const { createPublicClient, http } = await import("viem");
            const client = createPublicClient({ transport: http(SKALE_BITE_SANDBOX.rpcUrl) });
            if (walletAddr.startsWith("0x")) {
              const bal = await client.readContract({
                address: SKALE_BITE_SANDBOX.usdc as `0x${string}`,
                abi: [{ name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }] as const,
                functionName: "balanceOf",
                args: [walletAddr as `0x${string}`],
              });
              usdcBalance = (Number(bal) / 1_000_000).toFixed(6);
            }
          } catch {
            // Balance check failed
          }

          addEntry({
            type: "x402-dashboard" as const,
            data: {
              walletAddress: walletAddr,
              explorerUrl,
              usdcBalance,
              dailySpent,
              dailyLimit,
              budgetRemaining: Math.max(0, dailyLimit - dailySpent),
              recentPayments,
            },
          });
        } catch {
          addEntry({
            type: "x402-dashboard" as const,
            data: {
              walletAddress: process.env.AGENT_WALLET_ADDRESS || "Not configured",
              explorerUrl: "https://base-sepolia-testnet-explorer.skalenodes.com:10032",
              usdcBalance: "0.000000",
              dailySpent: 0,
              dailyLimit: 10.0,
              budgetRemaining: 10.0,
              recentPayments: [],
            },
          });
        }
      })();
      return;
    }

    // Only handle palette navigation when palette is visible
    if (!showPalette || isProcessing) return;

    const total = filteredCommands.length;
    if (total === 0) return;

    // Arrow up/down: navigate palette
    if (key.upArrow) {
      setPaletteIndex((i) => (i <= 0 ? total - 1 : i - 1));
      return;
    }
    if (key.downArrow) {
      setPaletteIndex((i) => (i >= total - 1 ? 0 : i + 1));
      return;
    }

    // Tab: autocomplete selected command
    if (key.tab) {
      autocompleteSelected();
      return;
    }

    // Escape: dismiss palette (clear input)
    if (key.escape) {
      setInput("");
      setPaletteIndex(0);
      return;
    }
  });

  // ── Submit handler ──

  const handleSubmit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isProcessing) return;

      // ── Palette is open: handle autocomplete vs execute ──
      if (trimmed.startsWith("/")) {
        const cmdPart = trimmed.slice(1).split(" ")[0];

        // Bare "/" or no exact match → autocomplete instead of submit
        if (!cmdPart || (!hasExactMatch && filteredCommands.length > 0)) {
          autocompleteSelected();
          return;
        }
      }

      setInput("");
      setPaletteIndex(0);

      // ── Built-in commands ──

      if (trimmed === "/quit" || trimmed === "/exit") {
        exit();
        return;
      }

      if (trimmed === "/clear") {
        setHistory([{ id: nextId(), type: "separator" }]);
        return;
      }

      if (trimmed === "/help" || trimmed === "?") {
        addEntry({ type: "user-input", text: trimmed });
        addEntry({
          type: "response",
          text:
            "## Commands\n\n" +
            "| Command | Description |\n" +
            "|---------|-------------|\n" +
            "| `/help` | Show this help |\n" +
            "| `/marathon <goal>` | Start autonomous marathon |\n" +
            "| `/model [name]` | Switch AI model |\n" +
            "| `/compact` | Compact conversation context |\n" +
            "| `/session [key]` | Switch session |\n" +
            "| `/theme [name]` | Switch theme |\n" +
            "| `/clear` | Clear screen |\n" +
            "| `/quit` | Exit Wispy |\n\n" +
            "Type `/` to browse all commands. Type naturally to chat.",
        });
        return;
      }

      // ── Delegate other slash commands ──

      if (trimmed.startsWith("/")) {
        addEntry({ type: "user-input", text: trimmed });
        try {
          const { handleSlashCommand } = await import("../commands.js");
          await handleSlashCommand(trimmed, {
            agent,
            runtimeDir,
            soulDir,
            currentSession,
            setSession: setCurrentSession,
            tokenManager,
          });
        } catch (err) {
          addEntry({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ── Chat with agent ──

      // Extract image file paths from the message (if any)
      const { text: chatText, images } = extractImages(trimmed);

      addEntry({ type: "user-input", text: trimmed });

      // Show image attachment indicator
      if (images.length > 0) {
        addEntry({ type: "image-attached", count: images.length });
      }

      setIsProcessing(true);
      setStreamingText("");
      setThinkingText("");
      thinkingTextRef.current = "";
      startThinking();

      const abort = new AbortController();
      abortRef.current = abort;

      let accumulated = "";
      let toolName = "";
      let toolStart = 0;
      let realInTk = 0;
      let realOutTk = 0;
      const chatStart = Date.now();

      try {
        for await (const chunk of agent.chatStream(
          chatText,
          "cli-user",
          "cli",
          currentSession as SessionType,
          images.length > 0 ? { images } : undefined,
        )) {
          if (abort.signal.aborted) break;

          switch (chunk.type) {
            case "thinking":
              if (chunk.content) {
                thinkingTextRef.current = chunk.content;
                setThinkingText(chunk.content);
              }
              break;

            case "tool_call": {
              stopThinking();
              let args: Record<string, unknown> = {};
              let name = chunk.content;
              try {
                if (chunk.content.includes("{")) {
                  const idx = chunk.content.indexOf("{");
                  args = JSON.parse(chunk.content.slice(idx));
                  name = chunk.content.slice(0, idx).trim();
                }
              } catch {}
              toolName = name;
              toolStart = Date.now();
              addEntry({ type: "tool-call", data: { name, args } });
              break;
            }

            case "tool_result": {
              const elapsed = Date.now() - toolStart;
              const isError =
                chunk.content.toLowerCase().includes("error") ||
                chunk.content.toLowerCase().includes("failed");
              addEntry({
                type: "tool-result",
                data: {
                  name: toolName || "tool",
                  result: chunk.content.slice(0, 200),
                  durationMs: elapsed,
                  isError,
                },
              });
              break;
            }

            case "text":
              stopThinking();
              // Commit thinking to history on first text chunk
              if (!accumulated && thinkingTextRef.current) {
                addEntry({ type: "thinking", text: thinkingTextRef.current });
                thinkingTextRef.current = "";
                setThinkingText("");
              }
              accumulated += chunk.content;
              setStreamingText(accumulated);
              break;

            case "usage": {
              try {
                const usage = JSON.parse(chunk.content);
                realInTk = usage.inputTokens ?? 0;
                realOutTk = usage.outputTokens ?? 0;
              } catch {}
              break;
            }

            case "context_compacted":
              addEntry({ type: "context-compacted" });
              break;

            case "done":
              stopThinking();
              break;
          }
        }

        // ── Finalize response ──

        if (accumulated && !abort.signal.aborted) {
          addEntry({ type: "response", text: accumulated });
          setStreamingText("");

          // Use real Gemini API token counts when available, fall back to estimation
          const outTk = realOutTk || Math.ceil(accumulated.length / 4);
          const inTk = realInTk || (Math.ceil(trimmed.length / 4) + 100);
          tokenManager.recordUsage(config.gemini.models.pro, inTk, outTk);

          const elapsed = ((Date.now() - chatStart) / 1000).toFixed(1);
          const stats = tokenManager.getStats();
          const contextWindow = tokenManager.getContextWindow(config.gemini.models.pro);
          const pct = Math.round(
            (stats.sessionTokens / contextWindow) * 100,
          );

          const modelDisplay = config.gemini.models.pro
            .replace("gemini-", "")
            .replace("-preview", "")
            .split("-")
            .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(" ");

          setLastStats({
            model: modelDisplay,
            tokens: inTk + outTk,
            cost: stats.sessionCost,
            contextPercent: pct,
            elapsed,
            mode: agent.getMode() === "plan" ? "plan" : undefined,
            backend: vertexEnabled ? "Vertex" : undefined,
          });
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          addEntry({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      abortRef.current = null;
      stopThinking();
      setIsProcessing(false);
      setStreamingText("");
    },
    [
      agent,
      config,
      tokenManager,
      vertexEnabled,
      runtimeDir,
      soulDir,
      currentSession,
      isProcessing,
      filteredCommands,
      hasExactMatch,
      paletteIndex,
      autocompleteSelected,
      addEntry,
      setLastStats,
      startThinking,
      stopThinking,
      exit,
    ],
  );

  // ── Palette scroll math ──

  const paletteTotal = filteredCommands.length;
  const paletteVisible = Math.min(paletteTotal, MAX_PALETTE_VISIBLE);
  let paletteScrollStart = 0;
  if (paletteTotal > MAX_PALETTE_VISIBLE) {
    const clamped = Math.max(0, Math.min(paletteIndex, paletteTotal - 1));
    paletteScrollStart = Math.max(
      0,
      Math.min(clamped - Math.floor(paletteVisible / 2), paletteTotal - paletteVisible),
    );
  }
  const paletteSlice = filteredCommands.slice(
    paletteScrollStart,
    paletteScrollStart + paletteVisible,
  );

  const paletteColWidth = paletteSlice.length > 0
    ? Math.min(
        Math.max(
          ...paletteSlice.map((c) => {
            const a = c.aliases?.length ? `, /${c.aliases.join(", /")}` : "";
            const args = c.args ? ` ${c.args}` : "";
            return `/${c.name}${a}${args}`.length;
          }),
        ) + 2,
        35,
      )
    : 20;

  // ── Gradient separator (full terminal width, like Copilot CLI) ──
  const theme = getTheme();
  const palSepWidth = process.stdout.columns || 80;
  const palSepLine = gradient(theme.gradientAccent)("\u2500".repeat(palSepWidth));

  // ── Render ──

  return (
    <Box flexDirection="column">
      {/* Completed messages - rendered once, never re-rendered */}
      <Static items={history}>
        {(entry) => <HistoryItem key={entry.id} entry={entry} />}
      </Static>

      {/* Thinking spinner */}
      {isProcessing && thinkingElapsed > 0 && !streamingText && (
        <ThinkingSpinner elapsed={thinkingElapsed} />
      )}

      {/* Thinking content (live) */}
      {isProcessing && thinkingText && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text dimColor color="#8B8B8B">
            {"\u2726"} Thinking
          </Text>
          <Box marginLeft={4}>
            <Text dimColor>{thinkingText.slice(-400)}</Text>
          </Box>
        </Box>
      )}

      {/* Streaming response text */}
      {streamingText && (
        <Box marginLeft={2} marginTop={1}>
          <Text>
            {streamingText}
            <Text color={theme.primaryHex}>{"\u2588"}</Text>
          </Text>
        </Box>
      )}

      {/*
        Input area: StatusLine + Lines + Prompt + Palette all in ONE flexbox.
        This is critical -- Ink only re-renders one contiguous dynamic block
        below Static. Everything interactive must be in this single tree.

        Layout matches GitHub Copilot CLI:
          ~[main*]                         gemini-2.5-pro
          ─────────────────────────────────────────────────
          ❯ /input
          ─────────────────────────────────────────────────
            /command         Description
            /command2        Description2
      */}
      {/* Input area -- always visible (like Claude Code) */}
      <Box flexDirection="column">
        {/* ── Top separator ── */}
        <Text>{palSepLine}</Text>

        {/* Input prompt */}
        <Box>
          <Text bold color={isProcessing ? "#666666" : theme.primaryHex}>
            {"\u276F"}{" "}
          </Text>
          <TextInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            placeholder={isProcessing ? "Wispy is thinking..." : "Type naturally, / for commands"}
          />
        </Box>

        {/* ── Bottom separator ── */}
        <Text>{palSepLine}</Text>

        {/* Hints bar with stats (when palette is NOT open) */}
        {!showPalette && (
          <HintsBar cols={process.stdout.columns || 80} stats={lastStats} />
        )}

        {/* Command palette rows (when palette IS open) */}
        {!isProcessing && showPalette && filteredCommands.length > 0 && (
          <Box flexDirection="column">
            {paletteScrollStart > 0 && (
              <Text dimColor>  {"\u25B2"} {paletteScrollStart} more above</Text>
            )}

            {paletteSlice.map((cmd, i) => (
              <PaletteRow
                key={cmd.name}
                cmd={cmd}
                colWidth={paletteColWidth}
                isSelected={paletteScrollStart + i === paletteIndex}
                query={paletteQuery}
                color={theme.primaryHex}
              />
            ))}

            {paletteScrollStart + paletteVisible < paletteTotal && (
              <Text dimColor>  {"\u25BC"} {paletteTotal - paletteScrollStart - paletteVisible} more below</Text>
            )}

            <Text dimColor>  {"\u2191\u2193"} navigate  Tab complete  Enter select  Esc dismiss</Text>
          </Box>
        )}

        {!isProcessing && showPalette && filteredCommands.length === 0 && (
          <Text dimColor>  No matching commands</Text>
        )}
      </Box>
    </Box>
  );
}
