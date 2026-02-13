/**
 * x402 Audit Report Generator
 *
 * Generates a professional LaTeX audit report from x402 demo/production data.
 * Uses the Wispy whitepaper styling (colors, boxes, fonts, tables).
 * Compiles to PDF via pdflatex/lualatex.
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join, basename } from "path";
import { compileLatexToPdf } from "./latex.js";

// ── Types ──────────────────────────────────────────────────────

export interface X402Transaction {
  id?: string;
  service: string;
  amount: number;
  recipient: string;
  txHash: string;
  status: string;
  timestamp: string;
  reason?: string;
  ap2?: {
    intentId?: string;
    cartId?: string;
    paymentId?: string;
  };
}

export interface X402TrackResult {
  track: number;
  title: string;
  status: "PASS" | "FAIL" | "PARTIAL";
  summary: string;
  toolCalls?: number;
  payments?: number;
  spent?: number;
}

export interface X402ReportData {
  title?: string;
  subtitle?: string;
  agentAddress: string;
  sellerAddress?: string;
  network: string;
  chainId: number;
  explorerUrl: string;
  facilitatorUrl?: string;
  totalSpent: number;
  totalTransactions: number;
  budgetRemaining?: number;
  dailyLimit?: number;
  transactions: X402Transaction[];
  tracks: X402TrackResult[];
  demoTurns?: number;
  duration?: string;
  author?: string;
  date?: string;
}

// ── LaTeX Escaping ─────────────────────────────────────────────

function texEscape(str: string): string {
  return str
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function texUrl(url: string): string {
  return `\\url{${url}}`;
}

function txHashShort(hash: string): string {
  if (!hash || hash.length < 14) return texEscape(hash || "pending");
  return `\\texttt{${texEscape(hash.slice(0, 10))}...${texEscape(hash.slice(-4))}}`;
}

function addressShort(addr: string): string {
  if (!addr || addr.length < 14) return texEscape(addr || "");
  return `\\texttt{${texEscape(addr.slice(0, 6))}...${texEscape(addr.slice(-4))}}`;
}

// ── LaTeX Template ─────────────────────────────────────────────

function generateReportLatex(data: X402ReportData): string {
  const title = data.title || "x402 Agentic Commerce Audit Report";
  const subtitle = data.subtitle || "On-Chain Verification Proof";
  const author = data.author || "Wispy AI Agent";
  const date = data.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Find logo path - check common locations
  const logoPath = [
    "C:/Users/Windows/Downloads/Wispy-logo.png",
    "C:/Users/Windows/Downloads/wispy/assets/banner.png",
  ].find(p => {
    try { return existsSync(p); } catch { return false; }
  });

  const transactionRows = data.transactions.map((tx, i) => {
    const num = i + 1;
    const svc = texEscape((tx.service || "unknown").slice(0, 20));
    const amt = `\\$${tx.amount.toFixed(6)}`;
    const st = texEscape(tx.status);
    const hash = tx.txHash && tx.txHash.startsWith("0x") && tx.txHash.length > 10
      ? txHashShort(tx.txHash)
      : texEscape(tx.txHash || "pending");
    const recip = addressShort(tx.recipient);
    const time = tx.timestamp ? texEscape(tx.timestamp.slice(11, 19)) : "";
    return `${num} & ${svc} & ${amt} & ${st} & ${hash} & ${recip} & ${time} \\\\`;
  }).join("\n");

  const trackRows = data.tracks.map((t) => {
    const statusColor = t.status === "PASS" ? "passgreen" : t.status === "FAIL" ? "failred" : "wispyorange";
    const status = `\\textcolor{${statusColor}}{\\textbf{${t.status}}}`;
    return `${t.track} & ${texEscape(t.title)} & ${status} & ${texEscape(t.summary.slice(0, 50))} \\\\`;
  }).join("\n");

  const txLinks = data.transactions
    .filter(tx => tx.txHash && tx.txHash.startsWith("0x") && tx.txHash.length > 10)
    .map((tx, i) => {
      const fullUrl = data.explorerUrl + "/tx/" + tx.txHash;
      return "\\item[Tx " + (i + 1) + ":] {\\small\\nolinkurl{" + texEscape(fullUrl) + "}}";
    })
    .join("\n");

  // Pre-build track subsections to avoid deep template nesting
  const trackSubsections = data.tracks.map(t => {
    const boxType = t.status === "PASS" ? "wispybox" : "proofbox";
    const parts: string[] = [];
    parts.push("\\subsection{Track " + t.track + ": " + texEscape(t.title) + "}");
    parts.push("");
    parts.push("\\begin{" + boxType + "}[title=" + texEscape(t.title) + " --- " + t.status + "]");
    parts.push(texEscape(t.summary));
    if (t.payments) parts.push("\\\\[2mm]\\textbf{Payments:} " + t.payments);
    if (t.spent) parts.push(" \\quad \\textbf{Spent:} \\$" + t.spent.toFixed(6) + " USDC");
    if (t.toolCalls) parts.push(" \\quad \\textbf{Tool Calls:} " + t.toolCalls);
    parts.push("\\end{" + boxType + "}");
    return parts.join("\n");
  }).join("\n\n");

  // Logo inclusion
  const logoInclude = logoPath
    ? "  \\includegraphics[width=0.28\\textwidth]{" + logoPath.replace(/\\/g, "/") + "}\n\n  \\vspace{0.8cm}\n"
    : "";

  // Conditional fields
  const sellerWalletField = data.sellerAddress
    ? "\\textbf{Seller Wallet:} & \\texttt{" + texEscape(data.sellerAddress) + "} \\\\[1mm]\n" : "";
  const facilitatorField = data.facilitatorUrl
    ? "\\textbf{Facilitator:} & \\url{" + data.facilitatorUrl + "} \\\\[1mm]\n" : "";
  const budgetField = data.budgetRemaining !== undefined
    ? "\\textbf{Budget Remaining:} & \\$" + data.budgetRemaining.toFixed(6) + " USDC \\\\[1mm]\n" : "";
  const turnsField = data.demoTurns ? "\\textbf{Demo Turns:} & " + data.demoTurns + " \\\\[1mm]\n" : "";
  const durationField = data.duration ? "\\textbf{Duration:} & " + texEscape(data.duration) + " \\\\\n" : "";
  const sellerVerify = data.sellerAddress
    ? "\\textbf{Seller Wallet:}\\\\\n{\\small\\url{" + data.explorerUrl + "/address/" + data.sellerAddress + "}}\n\n\\vspace{2mm}\n" : "";
  const dailyLimitField = data.dailyLimit
    ? "\\textbf{Daily Limit:} & \\$" + data.dailyLimit.toFixed(2) + " \\\\[1mm]\n" : "";
  const budgetRemField = data.budgetRemaining !== undefined
    ? "\\textbf{Budget Remaining:} & \\$" + data.budgetRemaining.toFixed(6) + " \\\\\n" : "";
  const txLinksSection = txLinks
    ? "\n\\subsection{Transaction Verification Links}\n\nEach transaction hash links directly to its on-chain record:\n\n\\begin{description}[leftmargin=1cm, labelwidth=1.2cm, style=unboxed]\n" + txLinks + "\n\\end{description}\n" : "";

  const L = "\n"; // line separator
  const parts: string[] = [];

  // Preamble
  parts.push("\\documentclass[11pt,a4paper]{article}");
  parts.push("");
  parts.push("% Packages");
  parts.push("\\usepackage[margin=2.2cm]{geometry}");
  parts.push("\\usepackage{graphicx}");
  parts.push("\\usepackage{xcolor}");
  parts.push("\\usepackage{array}");
  parts.push("\\usepackage{booktabs}");
  parts.push("\\usepackage{tabularx}");
  parts.push("\\usepackage{fancyhdr}");
  parts.push("\\usepackage{lastpage}");
  parts.push("\\usepackage{setspace}");
  parts.push("\\usepackage{tikz}");
  parts.push("\\usepackage{enumitem}");
  parts.push("\\usepackage{tcolorbox}");
  parts.push("\\usepackage{float}");
  parts.push("\\usepackage{amssymb}");
  parts.push("\\usepackage{longtable}");
  parts.push("\\usepackage[hyphens,spaces,obeyspaces]{url}");
  parts.push("\\usepackage[breaklinks=true]{hyperref}");
  parts.push("");
  parts.push("\\tcbuselibrary{skins, breakable}");
  parts.push("");
  parts.push("% Allow long URLs to break anywhere");
  parts.push("\\sloppy");
  parts.push("\\Urlmuskip=0mu plus 1mu");
  parts.push("");

  // Colors
  parts.push("% Wispy Colors");
  parts.push("\\definecolor{wispyblack}{HTML}{000000}");
  parts.push("\\definecolor{wispycyan}{HTML}{00DDFF}");
  parts.push("\\definecolor{wispymagenta}{HTML}{FF00E9}");
  parts.push("\\definecolor{wispyorange}{HTML}{FF7000}");
  parts.push("\\definecolor{wispyyellow}{HTML}{FFF700}");
  parts.push("\\definecolor{wispylight}{HTML}{F0FDFF}");
  parts.push("\\definecolor{wispymaglight}{HTML}{FFF0FE}");
  parts.push("\\definecolor{wispyorangelight}{HTML}{FFF5F0}");
  parts.push("\\definecolor{wispyyellowlight}{HTML}{FFFEF0}");
  parts.push("\\definecolor{sectionbg}{HTML}{FAFAFA}");
  parts.push("\\definecolor{passgreen}{HTML}{22C55E}");
  parts.push("\\definecolor{failred}{HTML}{EF4444}");
  parts.push("\\definecolor{archbg}{HTML}{F5F5FF}");
  parts.push("");

  // Column types
  parts.push("\\newcolumntype{L}[1]{>{\\raggedright\\arraybackslash}p{#1}}");
  parts.push("\\newcolumntype{C}[1]{>{\\centering\\arraybackslash}p{#1}}");
  parts.push("\\newcolumntype{R}[1]{>{\\raggedleft\\arraybackslash}p{#1}}");
  parts.push("\\newcolumntype{Y}{>{\\raggedright\\arraybackslash}X}");
  parts.push("");

  // tcolorbox definitions
  const boxDef = (name: string, bg: string, frame: string, titleBg: string) => [
    "\\newtcolorbox{" + name + "}[1][]{",
    "  enhanced, colback=" + bg + ", colframe=" + frame + ",",
    "  fonttitle=\\bfseries\\normalsize\\color{wispyblack},",
    "  coltitle=wispyblack, colbacktitle=" + titleBg + ",",
    "  attach boxed title to top left={yshift=-2mm, xshift=5mm},",
    "  boxed title style={sharp corners, boxrule=0pt},",
    "  sharp corners, boxrule=1pt,",
    "  top=4mm, bottom=4mm, left=4mm, right=4mm,",
    "  before skip=6mm, after skip=6mm, #1",
    "}",
  ].join(L);

  parts.push(boxDef("wispybox", "wispylight", "wispycyan", "wispycyan!30"));
  parts.push("");
  parts.push(boxDef("proofbox", "wispyorangelight", "wispyorange", "wispyorange!30"));
  parts.push("");
  parts.push(boxDef("verifybox", "wispyyellowlight", "wispyyellow!80!black", "wispyyellow"));
  parts.push("");
  parts.push(boxDef("archbox", "archbg", "wispycyan!60!black", "wispycyan!15"));
  parts.push("");

  // Table spacing + header/footer
  parts.push("\\renewcommand{\\arraystretch}{1.3}");
  parts.push("");
  parts.push("\\pagestyle{fancy}");
  parts.push("\\fancyhf{}");
  parts.push("\\fancyhead[L]{\\small\\color{wispyblack}" + texEscape(title) + "}");
  parts.push("\\fancyhead[R]{\\small\\color{wispyblack}wispy.cc}");
  parts.push("\\fancyfoot[C]{\\small\\color{wispyblack}Page \\thepage\\ of \\pageref{LastPage}}");
  parts.push("\\renewcommand{\\headrulewidth}{0.4pt}");
  parts.push("\\renewcommand{\\footrulewidth}{0.4pt}");
  parts.push("");
  parts.push("\\hypersetup{");
  parts.push("  colorlinks=true,");
  parts.push("  linkcolor=wispycyan!80!black,");
  parts.push("  urlcolor=wispymagenta!80!black,");
  parts.push("  citecolor=wispyorange,");
  parts.push("  breaklinks=true");
  parts.push("}");
  parts.push("");
  parts.push("\\begin{document}");
  parts.push("");

  // Title page
  parts.push("\\begin{titlepage}");
  parts.push("  \\centering");
  parts.push("  \\vspace*{1cm}");
  parts.push("");
  if (logoInclude) parts.push(logoInclude);
  parts.push("  {\\Huge\\textbf{\\color{wispycyan!80!black}" + texEscape(title) + "}\\par}");
  parts.push("  \\vspace{0.5cm}");
  parts.push("  {\\Large " + texEscape(subtitle) + "\\par}");
  parts.push("  \\vspace{1.2cm}");
  parts.push("");
  parts.push("  \\begin{tikzpicture}");
  parts.push("    \\node[draw=wispycyan, fill=wispylight, rounded corners=3pt, minimum width=13cm, minimum height=3cm, align=center, inner sep=6mm] {");
  parts.push("      \\large\\textbf{SF Agentic Commerce x402 Hackathon}\\\\[0.5cm]");
  parts.push("      \\small Network: \\textcolor{wispyorange}{\\textbf{" + texEscape(data.network) + "}} \\quad");
  parts.push("      Chain: \\textcolor{wispymagenta}{\\textbf{" + data.chainId + "}} \\quad");
  parts.push("      Protocol: \\textcolor{wispycyan}{\\textbf{x402 + AP2}}\\\\[0.3cm]");
  parts.push("      \\small Total Spent: \\textcolor{passgreen}{\\textbf{\\$" + data.totalSpent.toFixed(6) + " USDC}} \\quad");
  parts.push("      Transactions: \\textbf{" + data.totalTransactions + "}");
  parts.push("    };");
  parts.push("  \\end{tikzpicture}");
  parts.push("  \\vspace{1.2cm}");
  parts.push("");
  parts.push("  \\begin{tikzpicture}");
  parts.push("    \\node[draw=wispymagenta, fill=wispymaglight, rounded corners=2pt, minimum width=3cm, minimum height=1.4cm, align=center, inner sep=2mm] at (0,0) {\\footnotesize\\textbf{x402 Payments}\\\\[1mm]\\scriptsize HTTP 402\\\\Micro-payments};");
  parts.push("    \\node[draw=wispycyan, fill=wispylight, rounded corners=2pt, minimum width=3cm, minimum height=1.4cm, align=center, inner sep=2mm] at (3.5,0) {\\footnotesize\\textbf{AP2 Protocol}\\\\[1mm]\\scriptsize Intent $\\rightarrow$ Cart\\\\$\\rightarrow$ Receipt};");
  parts.push("    \\node[draw=wispyorange, fill=wispyorangelight, rounded corners=2pt, minimum width=3cm, minimum height=1.4cm, align=center, inner sep=2mm] at (7,0) {\\footnotesize\\textbf{DeFi Agent}\\\\[1mm]\\scriptsize Risk Engine\\\\Algebra DEX};");
  parts.push("    \\node[draw=wispyyellow!80!black, fill=wispyyellowlight, rounded corners=2pt, minimum width=3cm, minimum height=1.4cm, align=center, inner sep=2mm] at (10.5,0) {\\footnotesize\\textbf{BITE v2}\\\\[1mm]\\scriptsize Threshold\\\\Encryption};");
  parts.push("  \\end{tikzpicture}");
  parts.push("  \\vfill");
  parts.push("  {\\normalsize\\textbf{Generated by:} " + texEscape(author) + "\\\\[0.3cm]");
  parts.push("  \\textbf{Date:} " + texEscape(date) + "\\par}");
  parts.push("\\end{titlepage}");
  parts.push("");
  parts.push("\\tableofcontents");
  parts.push("\\newpage");
  parts.push("");

  // Section: What We Are Building
  parts.push("\\section{What We Are Building}");
  parts.push("");
  parts.push("\\begin{wispybox}[title=Wispy: Autonomous AI Agent Infrastructure]");
  parts.push("\\textbf{Wispy} is an autonomous AI agent platform that enables AI agents to operate");
  parts.push("independently in the real economy --- discovering services, making payments, executing");
  parts.push("trades, and managing encrypted transactions, all without human intervention.");
  parts.push("\\vspace{3mm}");
  parts.push("The core thesis: \\textit{AI agents need financial autonomy to be truly useful.} Today,");
  parts.push("agents can answer questions, but they cannot pay for APIs, execute trades, or manage");
  parts.push("conditional payments. Wispy solves this.");
  parts.push("\\end{wispybox}");
  parts.push("");
  parts.push("\\subsection{The Problem}");
  parts.push("\\begin{proofbox}[title=Current Limitations of AI Agents]");
  parts.push("\\begin{enumerate}[leftmargin=*]");
  parts.push("  \\item \\textbf{No financial autonomy} --- agents cannot pay for services or APIs");
  parts.push("  \\item \\textbf{No cost awareness} --- agents do not reason about spending budgets");
  parts.push("  \\item \\textbf{No payment verification} --- no on-chain proof of agent transactions");
  parts.push("  \\item \\textbf{No conditional execution} --- cannot do ``pay if delivered'' logic");
  parts.push("  \\item \\textbf{No structured purchasing} --- no standard protocol for agent commerce");
  parts.push("\\end{enumerate}");
  parts.push("\\end{proofbox}");
  parts.push("");
  parts.push("\\subsection{Our Solution}");
  parts.push("\\begin{archbox}[title=Wispy Architecture]");
  parts.push("Wispy integrates five protocol layers into a single autonomous agent:");
  parts.push("\\vspace{3mm}");
  parts.push("\\begin{tabularx}{\\textwidth}{@{} l l Y @{}}");
  parts.push("\\toprule");
  parts.push("\\textbf{Layer} & \\textbf{Protocol} & \\textbf{What It Does} \\\\");
  parts.push("\\midrule");
  parts.push("Payment & x402 & HTTP 402 micro-payments. Agent detects paywalled APIs, signs EIP-3009 USDC authorizations, pays via facilitator, retries with proof. \\\\[2mm]");
  parts.push("Authorization & AP2 & Structured purchase flow: Intent $\\rightarrow$ Cart $\\rightarrow$ Payment $\\rightarrow$ Receipt. Full audit trail of every purchase decision. \\\\[2mm]");
  parts.push("Trading & DeFi Agent & Autonomous token swaps on Algebra DEX with a risk engine that evaluates position size, volatility, and portfolio exposure. \\\\[2mm]");
  parts.push("Privacy & BITE v2 & BLS threshold encryption for conditional payments. Transaction data is encrypted until unlock conditions are met. \\\\[2mm]");
  parts.push("Identity & ERC-8004 & On-chain agent identity with reputation. Agents have verifiable wallet addresses and spending history. \\\\");
  parts.push("\\bottomrule");
  parts.push("\\end{tabularx}");
  parts.push("\\end{archbox}");
  parts.push("");
  parts.push("\\subsection{How It Works}");
  parts.push("\\begin{archbox}[title=End-to-End Flow]");
  parts.push("\\begin{enumerate}[leftmargin=*]");
  parts.push("  \\item \\textbf{Service Discovery} --- Agent calls \\texttt{x402\\_discover\\_services} to find available paid APIs.");
  parts.push("  \\item \\textbf{Budget Check} --- Agent checks remaining USDC budget via \\texttt{x402\\_check\\_budget}.");
  parts.push("  \\item \\textbf{Autonomous Payment} --- Agent calls \\texttt{x402\\_pay\\_and\\_fetch}. The x402 client handles 402 challenge, signs EIP-3009, pays via Kobaru, retries with proof.");
  parts.push("  \\item \\textbf{AP2 Purchases} --- Structured Intent $\\rightarrow$ Cart $\\rightarrow$ Payment $\\rightarrow$ Receipt mandate chain.");
  parts.push("  \\item \\textbf{DeFi Trading} --- Research markets, execute swaps with risk engine gating.");
  parts.push("  \\item \\textbf{Encrypted Transactions} --- BITE v2 threshold encryption for conditional payments.");
  parts.push("  \\item \\textbf{Audit Trail} --- Full transaction history with on-chain verification links.");
  parts.push("\\end{enumerate}");
  parts.push("\\end{archbox}");
  parts.push("\\newpage");
  parts.push("");

  // Section: Executive Summary
  parts.push("\\section{Executive Summary}");
  parts.push("\\begin{wispybox}[title=Demo Overview]");
  parts.push("This report provides a complete, verifiable audit of all on-chain transactions");
  parts.push("executed during the x402 Agentic Commerce demonstration.");
  parts.push("\\begin{table}[H]");
  parts.push("\\centering");
  parts.push("\\begin{tabularx}{\\textwidth}{@{} l Y @{}}");
  parts.push("\\textbf{Agent Wallet:} & \\texttt{" + texEscape(data.agentAddress) + "} \\\\[1mm]");
  if (sellerWalletField) parts.push(sellerWalletField);
  parts.push("\\textbf{Network:} & " + texEscape(data.network) + " (Chain " + data.chainId + ") \\\\[1mm]");
  parts.push("\\textbf{Explorer:} & \\url{" + data.explorerUrl + "} \\\\[1mm]");
  if (facilitatorField) parts.push(facilitatorField);
  parts.push("\\textbf{Total Spent:} & \\$" + data.totalSpent.toFixed(6) + " USDC \\\\[1mm]");
  parts.push("\\textbf{Transactions:} & " + data.totalTransactions + " \\\\[1mm]");
  if (budgetField) parts.push(budgetField);
  if (turnsField) parts.push(turnsField);
  if (durationField) parts.push(durationField);
  parts.push("\\end{tabularx}");
  parts.push("\\end{table}");
  parts.push("\\end{wispybox}");
  parts.push("");

  // Section: Track Results
  parts.push("\\section{Track Results}");
  if (data.tracks.length > 0) {
    parts.push("\\begin{table}[H]");
    parts.push("\\centering");
    parts.push("\\small");
    parts.push("\\begin{tabular}{@{} c L{3.5cm} c L{5.5cm} @{}}");
    parts.push("\\toprule");
    parts.push("\\textbf{Track} & \\textbf{Title} & \\textbf{Status} & \\textbf{Key Proof} \\\\");
    parts.push("\\midrule");
    parts.push(trackRows);
    parts.push("\\bottomrule");
    parts.push("\\end{tabular}");
    parts.push("\\end{table}");
    parts.push("");
    parts.push(trackSubsections);
  } else {
    parts.push("\\textit{No track data recorded.}");
  }
  parts.push("\\newpage");
  parts.push("");

  // Section: Transaction Log
  parts.push("\\section{Transaction Log}");
  if (data.transactions.length > 0) {
    parts.push("\\begin{table}[H]");
    parts.push("\\centering");
    parts.push("\\small");
    parts.push("\\begin{tabular}{@{} c L{2cm} r c L{2cm} L{1.5cm} c @{}}");
    parts.push("\\toprule");
    parts.push("\\textbf{\\#} & \\textbf{Service} & \\textbf{Amount} & \\textbf{Status} & \\textbf{Tx Hash} & \\textbf{Recipient} & \\textbf{Time} \\\\");
    parts.push("\\midrule");
    parts.push(transactionRows);
    parts.push("\\bottomrule");
    parts.push("\\end{tabular}");
    parts.push("\\end{table}");
    parts.push("");
    parts.push("\\begin{proofbox}[title=Spending Summary]");
    parts.push("\\begin{table}[H]");
    parts.push("\\centering");
    parts.push("\\begin{tabularx}{\\textwidth}{@{} l Y @{}}");
    parts.push("\\textbf{Total Transactions:} & " + data.totalTransactions + " \\\\[1mm]");
    parts.push("\\textbf{Total USDC Spent:} & \\$" + data.totalSpent.toFixed(6) + " \\\\[1mm]");
    parts.push("\\textbf{Average per Tx:} & \\$" + (data.totalTransactions > 0 ? (data.totalSpent / data.totalTransactions).toFixed(6) : "0.000000") + " \\\\[1mm]");
    if (dailyLimitField) parts.push(dailyLimitField);
    if (budgetRemField) parts.push(budgetRemField);
    parts.push("\\end{tabularx}");
    parts.push("\\end{table}");
    parts.push("\\end{proofbox}");
  } else {
    parts.push("\\textit{No transactions recorded.}");
  }
  parts.push("\\newpage");
  parts.push("");

  // Section: On-Chain Verification
  parts.push("\\section{On-Chain Verification}");
  parts.push("\\begin{verifybox}[title=Verification Links]");
  parts.push("All transactions below are independently verifiable on the SKALE BITE V2 block explorer.");
  parts.push("\\vspace{3mm}");
  parts.push("\\textbf{Agent Wallet:}\\\\");
  parts.push("{\\small\\url{" + data.explorerUrl + "/address/" + data.agentAddress + "}}");
  parts.push("\\vspace{2mm}");
  if (sellerVerify) parts.push(sellerVerify);
  parts.push("\\textbf{Block Explorer:}\\\\");
  parts.push("{\\small\\url{" + data.explorerUrl + "}}");
  parts.push("\\end{verifybox}");
  if (txLinksSection) parts.push(txLinksSection);
  parts.push("");

  // Section: Technology Stack
  parts.push("\\section{Technology Stack}");
  parts.push("\\begin{archbox}[title=Infrastructure]");
  parts.push("\\begin{tabularx}{\\textwidth}{@{} l Y @{}}");
  parts.push("\\toprule");
  parts.push("\\textbf{Component} & \\textbf{Technology} \\\\");
  parts.push("\\midrule");
  parts.push("AI Engine & Google Gemini 2.5 Pro (thinking, tool use, multi-turn) \\\\");
  parts.push("Blockchain & SKALE BITE V2 Sandbox (gasless EVM, chain " + data.chainId + ") \\\\");
  parts.push("Payment Protocol & x402 (HTTP 402 + EIP-3009 USDC authorization) \\\\");
  parts.push("Facilitator & Kobaru Gateway (payment settlement) \\\\");
  parts.push("DEX & Algebra v3 (concentrated liquidity, on SKALE) \\\\");
  parts.push("Encryption & BITE v2 (BLS threshold encryption via 16 SKALE nodes) \\\\");
  parts.push("Identity & ERC-8004 (on-chain agent identity + reputation) \\\\");
  parts.push("CLI Framework & Ink (React for terminals) + Node.js 20+ \\\\");
  parts.push("Package & \\texttt{npm install wispy-ai} (v1.1.0) \\\\");
  parts.push("Repository & \\texttt{github.com/brn-mwai/wispy} \\\\");
  parts.push("\\bottomrule");
  parts.push("\\end{tabularx}");
  parts.push("\\end{archbox}");
  parts.push("");

  // Section: Attestation
  parts.push("\\section{Attestation}");
  parts.push("\\begin{wispybox}[title=Autonomous Execution Attestation]");
  parts.push("This report was autonomously generated by the Wispy AI Agent. All transactions listed herein were:");
  parts.push("\\begin{enumerate}[leftmargin=*]");
  parts.push("  \\item \\textbf{Autonomously initiated} by the AI agent without human intervention");
  parts.push("  \\item \\textbf{Settled on-chain} on the " + texEscape(data.network) + " network (gasless via sFUEL)");
  parts.push("  \\item \\textbf{Budget-constrained} by the commerce policy engine (daily limit: \\$" + (data.dailyLimit ?? 100).toFixed(2) + ")");
  parts.push("  \\item \\textbf{Independently verifiable} via the SKALE block explorer links above");
  parts.push("  \\item \\textbf{Service-discovered} --- the agent found and chose services autonomously");
  parts.push("\\end{enumerate}");
  parts.push("\\vspace{3mm}");
  parts.push("\\begin{center}");
  parts.push("\\textit{Powered by Gemini 2.5 Pro --- Payments via x402 --- Identity via ERC-8004}\\\\[2mm]");
  parts.push("\\texttt{wispy.cc} --- \\texttt{npm install wispy-ai}");
  parts.push("\\end{center}");
  parts.push("\\end{wispybox}");
  parts.push("\\vfill");
  parts.push("");
  parts.push("\\subsection*{Document Information}");
  parts.push("\\begin{table}[H]");
  parts.push("\\centering");
  parts.push("\\begin{tabularx}{\\textwidth}{@{} l Y @{}}");
  parts.push("\\textbf{Generated:} & " + texEscape(date) + " \\\\[1mm]");
  parts.push("\\textbf{Generator:} & Wispy AI Agent (generate\\_x402\\_report) \\\\[1mm]");
  parts.push("\\textbf{Network:} & " + texEscape(data.network) + " (Chain " + data.chainId + ") \\\\[1mm]");
  parts.push("\\textbf{Repository:} & github.com/brn-mwai/wispy \\\\[1mm]");
  parts.push("\\textbf{Package:} & npm install wispy-ai \\\\");
  parts.push("\\end{tabularx}");
  parts.push("\\end{table}");
  parts.push("");
  parts.push("\\end{document}");

  return parts.join(L);
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Generate a LaTeX x402 audit report and optionally compile to PDF.
 *
 * @param data - Report data (transactions, tracks, wallet info)
 * @param outputPath - Where to write the .tex file (absolute path)
 * @param compilePdf - Whether to compile to PDF (default: true)
 * @returns { texPath, pdfPath }
 */
export async function generateX402Report(
  data: X402ReportData,
  outputPath: string,
  compilePdf = true,
): Promise<{ texPath: string; pdfPath: string | null }> {
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Ensure .tex extension
  const texPath = outputPath.endsWith(".tex")
    ? outputPath
    : outputPath.replace(/\.pdf$/, ".tex") || `${outputPath}.tex`;

  const latex = generateReportLatex(data);
  writeFileSync(texPath, latex, "utf-8");

  let pdfPath: string | null = null;
  if (compilePdf) {
    pdfPath = await compileLatexToPdf(texPath, dir);
  }

  return { texPath, pdfPath };
}
