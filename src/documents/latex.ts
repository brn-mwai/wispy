/**
 * LaTeX Document Generator
 *
 * Creates professional documents using LaTeX with support for:
 * - Whitepapers, reports, proposals, guides
 * - Charts, graphs, flowcharts, diagrams
 * - Tables with styling
 * - PDF compilation and Telegram delivery
 *
 * Emulates the style from AXI_Founder_Mastery_Guide_Complete.tex
 * and Wispy_Technical_Whitepaper.tex
 */

import { createLogger } from "../infra/logger.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { join, dirname, basename } from "path";
import { execSync } from "child_process";

const log = createLogger("latex");

// Color schemes for different document types
export const COLOR_SCHEMES = {
  professional: {
    primary: "2E86AB",
    secondary: "1B2A3D",
    accent: "2ECB71",
    light: "E8F8F0",
    warning: "F59E0B",
    error: "EF4444",
    info: "3B82F6",
  },
  wispy: {
    primary: "00DDFF",
    secondary: "000000",
    accent: "FF00E9",
    light: "F0FDFF",
    warning: "FFF700",
    error: "FF7000",
    info: "00DDFF",
  },
  corporate: {
    primary: "1E40AF",
    secondary: "111827",
    accent: "10B981",
    light: "EFF6FF",
    warning: "F97316",
    error: "DC2626",
    info: "0EA5E9",
  },
  minimal: {
    primary: "374151",
    secondary: "1F2937",
    accent: "6B7280",
    light: "F9FAFB",
    warning: "D97706",
    error: "B91C1C",
    info: "4B5563",
  },
};

export interface DocumentConfig {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  type: "whitepaper" | "report" | "proposal" | "guide" | "letter" | "invoice" | "presentation";
  colorScheme?: keyof typeof COLOR_SCHEMES;
  logo?: string;
  company?: string;
  sections: DocumentSection[];
  tableOfContents?: boolean;
  pageNumbers?: boolean;
  headerFooter?: boolean;
}

export interface DocumentSection {
  title: string;
  content: string | ContentBlock[];
  subsections?: DocumentSubsection[];
}

export interface DocumentSubsection {
  title: string;
  content: string | ContentBlock[];
}

export type ContentBlock =
  | { type: "text"; content: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "table"; headers: string[]; rows: string[][]; caption?: string }
  | { type: "code"; language: string; content: string }
  | { type: "box"; title: string; content: string; style: "info" | "warning" | "success" | "danger" }
  | { type: "chart"; chartType: string; title: string; data: ChartData }
  | { type: "flowchart"; title: string; nodes: FlowNode[]; connections: FlowConnection[] }
  | { type: "quote"; content: string; author?: string }
  | { type: "image"; path: string; caption?: string; width?: string };

export interface ChartData {
  labels: string[];
  datasets: { name: string; values: number[]; color?: string }[];
}

export interface FlowNode {
  id: string;
  label: string;
  type: "start" | "process" | "decision" | "end" | "io";
}

export interface FlowConnection {
  from: string;
  to: string;
  label?: string;
}

/**
 * Generate LaTeX preamble with packages and styling
 */
function generatePreamble(config: DocumentConfig): string {
  const scheme = COLOR_SCHEMES[config.colorScheme || "professional"];

  return `\\documentclass[11pt,a4paper]{article}

% Packages
\\usepackage[margin=2.2cm]{geometry}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\usepackage{fancyhdr}
\\usepackage{lastpage}
\\usepackage{setspace}
\\usepackage{tikz}
\\usepackage{enumitem}
\\usepackage{multicol}
\\usepackage{tcolorbox}
\\usepackage{float}
\\usepackage{pgfplots}
\\usepackage{amssymb}
\\usepackage{amsmath}
\\usepackage{listings}

\\usetikzlibrary{shapes.geometric, arrows.meta, positioning, fit, backgrounds, calc, patterns}
\\tcbuselibrary{skins, breakable}
\\pgfplotsset{compat=1.18}

% Colors
\\definecolor{primary}{HTML}{${scheme.primary}}
\\definecolor{secondary}{HTML}{${scheme.secondary}}
\\definecolor{accent}{HTML}{${scheme.accent}}
\\definecolor{lightbg}{HTML}{${scheme.light}}
\\definecolor{warningcolor}{HTML}{${scheme.warning}}
\\definecolor{errorcolor}{HTML}{${scheme.error}}
\\definecolor{infocolor}{HTML}{${scheme.info}}
\\definecolor{codebg}{HTML}{1E1E1E}
\\definecolor{codetext}{HTML}{D4D4D4}

% Custom column types
\\newcolumntype{L}[1]{>{\\raggedright\\arraybackslash}p{#1}}
\\newcolumntype{C}[1]{>{\\centering\\arraybackslash}p{#1}}
\\newcolumntype{R}[1]{>{\\raggedleft\\arraybackslash}p{#1}}
\\newcolumntype{Y}{>{\\raggedright\\arraybackslash}X}

% Code listing style
\\lstdefinestyle{wispycode}{
  backgroundcolor=\\color{codebg},
  basicstyle=\\ttfamily\\small\\color{codetext},
  breaklines=true,
  captionpos=b,
  keepspaces=true,
  showspaces=false,
  showstringspaces=false,
  frame=none,
  xleftmargin=4mm,
  xrightmargin=4mm,
  aboveskip=3mm,
  belowskip=3mm
}
\\lstset{style=wispycode}

% Custom boxes
\\newtcolorbox{infobox}[1][]{
  enhanced,
  colback=lightbg,
  colframe=infocolor,
  fonttitle=\\bfseries\\normalsize\\color{secondary},
  coltitle=secondary,
  colbacktitle=infocolor!30,
  attach boxed title to top left={yshift=-2mm, xshift=5mm},
  boxed title style={sharp corners, boxrule=0pt},
  sharp corners,
  boxrule=1pt,
  top=4mm, bottom=4mm, left=4mm, right=4mm,
  before skip=6mm, after skip=6mm,
  #1
}

\\newtcolorbox{successbox}[1][]{
  enhanced,
  colback=accent!10,
  colframe=accent,
  fonttitle=\\bfseries\\normalsize\\color{secondary},
  sharp corners,
  boxrule=1pt,
  top=4mm, bottom=4mm, left=4mm, right=4mm,
  before skip=6mm, after skip=6mm,
  #1
}

\\newtcolorbox{warningbox}[1][]{
  enhanced,
  colback=warningcolor!10,
  colframe=warningcolor,
  fonttitle=\\bfseries\\normalsize\\color{secondary},
  sharp corners,
  boxrule=1pt,
  top=4mm, bottom=4mm, left=4mm, right=4mm,
  before skip=6mm, after skip=6mm,
  #1
}

\\newtcolorbox{dangerbox}[1][]{
  enhanced,
  colback=errorcolor!10,
  colframe=errorcolor,
  fonttitle=\\bfseries\\normalsize\\color{white},
  coltitle=white,
  colbacktitle=errorcolor,
  attach boxed title to top left={yshift=-2mm, xshift=5mm},
  boxed title style={sharp corners, boxrule=0pt},
  sharp corners,
  boxrule=1pt,
  top=4mm, bottom=4mm, left=4mm, right=4mm,
  before skip=6mm, after skip=6mm,
  #1
}

% Improved table spacing
\\renewcommand{\\arraystretch}{1.3}

% Header and Footer
\\pagestyle{fancy}
\\fancyhf{}
${config.headerFooter !== false ? `
\\fancyhead[L]{\\small\\color{secondary}${escapeLatex(config.title)}}
\\fancyhead[R]{\\small\\color{secondary}${escapeLatex(config.company || "")}}
\\fancyfoot[C]{\\small\\color{secondary}Page \\thepage\\ of \\pageref{LastPage}}
\\renewcommand{\\headrulewidth}{0.4pt}
\\renewcommand{\\footrulewidth}{0.4pt}
` : "\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}"}

% Hyperref setup
\\hypersetup{
  colorlinks=true,
  linkcolor=primary,
  urlcolor=infocolor,
  citecolor=primary
}

\\setstretch{1.1}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{6pt}

\\begin{document}
`;
}

/**
 * Generate title page
 */
function generateTitlePage(config: DocumentConfig): string {
  const subtitle = config.subtitle ? `\\vspace{0.4cm}\n{\\Large\\color{primary} ${escapeLatex(config.subtitle)}\\par}` : "";
  const logo = config.logo ? `\\includegraphics[width=0.2\\textwidth]{${config.logo}}\\vspace{0.8cm}` : "";

  return `
% Title Page
\\begin{titlepage}
  \\centering
  \\vspace*{1cm}

  ${logo}

  {\\Huge\\bfseries\\color{secondary} ${escapeLatex(config.title)}\\par}

  ${subtitle}

  \\vspace{1cm}

  \\begin{tikzpicture}
    \\node[draw=primary, line width=1.2pt, fill=lightbg, rounded corners=10pt, minimum width=12cm, minimum height=2cm, align=center] {
      \\large ${escapeLatex(config.type.charAt(0).toUpperCase() + config.type.slice(1))}
    };
  \\end{tikzpicture}

  \\vfill

  {\\large\\color{secondary}
  ${config.author ? `\\textbf{Author:} ${escapeLatex(config.author)}\\\\[0.2cm]` : ""}
  ${config.company ? `\\textbf{Company:} ${escapeLatex(config.company)}\\\\[0.2cm]` : ""}
  \\textbf{Date:} ${escapeLatex(config.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))}\\par}

\\end{titlepage}
`;
}

/**
 * Escape special LaTeX characters
 */
function escapeLatex(text: string): string {
  if (!text) return "";
  return text
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

/**
 * Convert markdown-like formatting to LaTeX
 */
function formatContent(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}")
    .replace(/\*(.+?)\*/g, "\\textit{$1}")
    .replace(/`(.+?)`/g, "\\texttt{$1}")
    .replace(/\n\n/g, "\n\n\\vspace{6pt}\n\n");
}

/**
 * Generate content block LaTeX
 */
function generateContentBlock(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return formatContent(escapeLatex(block.content));

    case "list":
      const env = block.ordered ? "enumerate" : "itemize";
      const items = block.items.map(item => `\\item ${escapeLatex(item)}`).join("\n");
      return `\\begin{${env}}[leftmargin=*, itemsep=2pt]\n${items}\n\\end{${env}}`;

    case "table":
      const colSpec = block.headers.map(() => "X").join(" ");
      const headerRow = block.headers.map(h => `\\textbf{${escapeLatex(h)}}`).join(" & ");
      const dataRows = block.rows.map(row => row.map(cell => escapeLatex(cell)).join(" & ")).join(" \\\\\n");
      return `\\begin{table}[H]
\\centering
\\begin{tabularx}{\\textwidth}{@{} ${colSpec} @{}}
\\toprule
${headerRow} \\\\
\\midrule
${dataRows} \\\\
\\bottomrule
\\end{tabularx}
${block.caption ? `\\caption*{\\textit{${escapeLatex(block.caption)}}}` : ""}
\\end{table}`;

    case "code":
      return `\\begin{lstlisting}[language=${block.language}]
${block.content}
\\end{lstlisting}`;

    case "box":
      const boxEnv = {
        info: "infobox",
        warning: "warningbox",
        success: "successbox",
        danger: "dangerbox",
      }[block.style];
      return `\\begin{${boxEnv}}[title=${escapeLatex(block.title)}]
${formatContent(escapeLatex(block.content))}
\\end{${boxEnv}}`;

    case "chart":
      return generateChart(block.chartType, block.title, block.data);

    case "flowchart":
      return generateFlowchart(block.title, block.nodes, block.connections);

    case "quote":
      return "\\begin{quote}\n" +
        "\\textit{``" + escapeLatex(block.content) + "''}\n" +
        (block.author ? "\\\\[4pt]--- " + escapeLatex(block.author) + "\n" : "") +
        "\\end{quote}";

    case "image":
      return `\\begin{figure}[H]
\\centering
\\includegraphics[width=${block.width || "0.8\\textwidth"}]{${block.path}}
${block.caption ? `\\caption{${escapeLatex(block.caption)}}` : ""}
\\end{figure}`;

    default:
      return "";
  }
}

/**
 * Generate chart using pgfplots
 */
function generateChart(chartType: string, title: string, data: ChartData): string {
  const colors = ["primary", "accent", "infocolor", "warningcolor", "errorcolor"];

  if (chartType === "bar") {
    const coords = data.datasets.map((ds, i) => {
      const points = data.labels.map((label, j) => `(${j},${ds.values[j]})`).join(" ");
      return `\\addplot[ybar, fill=${colors[i % colors.length]}!70] coordinates {${points}};`;
    }).join("\n      ");

    return `\\begin{tikzpicture}
  \\begin{axis}[
    title={${escapeLatex(title)}},
    ybar,
    enlarge x limits=0.15,
    legend style={at={(0.5,-0.15)}, anchor=north},
    symbolic x coords={${data.labels.map(l => escapeLatex(l)).join(",")}},
    xtick=data,
    nodes near coords,
    width=12cm,
    height=8cm,
  ]
      ${coords}
      \\legend{${data.datasets.map(ds => escapeLatex(ds.name)).join(",")}}
  \\end{axis}
\\end{tikzpicture}`;
  }

  if (chartType === "line") {
    const coords = data.datasets.map((ds, i) => {
      const points = data.labels.map((label, j) => `(${j},${ds.values[j]})`).join(" ");
      return `\\addplot[color=${colors[i % colors.length]}, mark=*, thick] coordinates {${points}};`;
    }).join("\n      ");

    return `\\begin{tikzpicture}
  \\begin{axis}[
    title={${escapeLatex(title)}},
    xlabel={},
    ylabel={},
    legend style={at={(0.5,-0.15)}, anchor=north},
    symbolic x coords={${data.labels.map(l => escapeLatex(l)).join(",")}},
    xtick=data,
    width=12cm,
    height=8cm,
  ]
      ${coords}
      \\legend{${data.datasets.map(ds => escapeLatex(ds.name)).join(",")}}
  \\end{axis}
\\end{tikzpicture}`;
  }

  if (chartType === "pie") {
    const total = data.datasets[0]?.values.reduce((a, b) => a + b, 0) || 1;
    const slices = data.labels.map((label, i) => {
      const pct = (data.datasets[0].values[i] / total) * 100;
      return `${pct}/${escapeLatex(label)}`;
    }).join(", ");

    return `\\begin{tikzpicture}
  \\pie[radius=4, text=legend, color={primary!70, accent!70, infocolor!70, warningcolor!70, errorcolor!70}]{${slices}}
\\end{tikzpicture}`;
  }

  return "";
}

/**
 * Generate flowchart using TikZ
 */
function generateFlowchart(title: string, nodes: FlowNode[], connections: FlowConnection[]): string {
  const nodeStyles: Record<string, string> = {
    start: "ellipse, draw=accent, fill=accent!20, minimum width=2cm, minimum height=1cm",
    end: "ellipse, draw=errorcolor, fill=errorcolor!20, minimum width=2cm, minimum height=1cm",
    process: "rectangle, draw=primary, fill=primary!10, minimum width=3cm, minimum height=1cm, rounded corners",
    decision: "diamond, draw=warningcolor, fill=warningcolor!10, minimum width=2.5cm, minimum height=1.5cm, aspect=2",
    io: "trapezium, draw=infocolor, fill=infocolor!10, trapezium left angle=70, trapezium right angle=110, minimum width=2cm",
  };

  const nodesDef = nodes.map((node, i) => {
    const style = nodeStyles[node.type] || nodeStyles.process;
    const pos = i === 0 ? "" : `, below=of ${nodes[i-1].id}`;
    return `\\node[${style}${pos}] (${node.id}) {${escapeLatex(node.label)}};`;
  }).join("\n    ");

  const connDef = connections.map(conn => {
    const label = conn.label ? `node[midway, right] {${escapeLatex(conn.label)}}` : "";
    return `\\draw[->, thick] (${conn.from}) -- (${conn.to}) ${label};`;
  }).join("\n    ");

  return `\\begin{center}
\\textbf{${escapeLatex(title)}}
\\end{center}

\\begin{tikzpicture}[node distance=1.5cm, auto]
    ${nodesDef}
    ${connDef}
\\end{tikzpicture}`;
}

/**
 * Generate full LaTeX document
 */
export function generateLatexDocument(config: DocumentConfig): string {
  let latex = generatePreamble(config);
  latex += generateTitlePage(config);

  if (config.tableOfContents !== false) {
    latex += "\n\\tableofcontents\n\\newpage\n";
  }

  for (const section of config.sections) {
    latex += `\n\\section{${escapeLatex(section.title)}}\n\n`;

    if (typeof section.content === "string") {
      latex += formatContent(escapeLatex(section.content)) + "\n";
    } else if (Array.isArray(section.content)) {
      for (const block of section.content) {
        latex += generateContentBlock(block) + "\n\n";
      }
    }

    if (section.subsections) {
      for (const sub of section.subsections) {
        latex += `\n\\subsection{${escapeLatex(sub.title)}}\n\n`;
        if (typeof sub.content === "string") {
          latex += formatContent(escapeLatex(sub.content)) + "\n";
        } else if (Array.isArray(sub.content)) {
          for (const block of sub.content) {
            latex += generateContentBlock(block) + "\n\n";
          }
        }
      }
    }
  }

  latex += "\n\\end{document}\n";
  return latex;
}

/**
 * Compile LaTeX to PDF
 */
export async function compileLatexToPdf(texPath: string, outputDir?: string): Promise<string | null> {
  const dir = outputDir || dirname(texPath);
  const name = basename(texPath, ".tex");

  try {
    // Ensure directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Try pdflatex first
    try {
      execSync(`pdflatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`, {
        stdio: "pipe",
        timeout: 60000,
      });
      // Run twice for TOC
      execSync(`pdflatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`, {
        stdio: "pipe",
        timeout: 60000,
      });

      const pdfPath = join(dir, `${name}.pdf`);
      if (existsSync(pdfPath)) {
        // Cleanup aux files
        const exts = [".aux", ".log", ".out", ".toc"];
        for (const ext of exts) {
          const auxPath = join(dir, `${name}${ext}`);
          if (existsSync(auxPath)) {
            try { unlinkSync(auxPath); } catch {}
          }
        }
        log.info("PDF compiled: %s", pdfPath);
        return pdfPath;
      }
    } catch (pdflatexErr) {
      log.debug("pdflatex failed, trying lualatex: %s", pdflatexErr);

      // Try lualatex as fallback
      try {
        execSync(`lualatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`, {
          stdio: "pipe",
          timeout: 120000,
        });
        execSync(`lualatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`, {
          stdio: "pipe",
          timeout: 120000,
        });

        const pdfPath = join(dir, `${name}.pdf`);
        if (existsSync(pdfPath)) {
          log.info("PDF compiled with lualatex: %s", pdfPath);
          return pdfPath;
        }
      } catch (lualatexErr) {
        log.error("lualatex also failed: %s", lualatexErr);
      }
    }

    return null;
  } catch (err) {
    log.error({ err }, "LaTeX compilation failed");
    return null;
  }
}

/**
 * Create document and compile to PDF
 */
export async function createDocument(
  config: DocumentConfig,
  outputPath: string
): Promise<{ texPath: string; pdfPath: string | null }> {
  const dir = dirname(outputPath);
  const name = basename(outputPath, ".pdf").replace(".tex", "");

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate LaTeX
  const latex = generateLatexDocument(config);
  const texPath = join(dir, `${name}.tex`);
  writeFileSync(texPath, latex, "utf-8");
  log.info("LaTeX file created: %s", texPath);

  // Compile to PDF
  const pdfPath = await compileLatexToPdf(texPath, dir);

  return { texPath, pdfPath };
}

/**
 * Quick document creation helpers
 */
export async function createWhitepaper(
  title: string,
  sections: DocumentSection[],
  outputPath: string,
  options?: Partial<DocumentConfig>
): Promise<{ texPath: string; pdfPath: string | null }> {
  return createDocument(
    {
      title,
      type: "whitepaper",
      sections,
      colorScheme: "wispy",
      tableOfContents: true,
      ...options,
    },
    outputPath
  );
}

export async function createReport(
  title: string,
  sections: DocumentSection[],
  outputPath: string,
  options?: Partial<DocumentConfig>
): Promise<{ texPath: string; pdfPath: string | null }> {
  return createDocument(
    {
      title,
      type: "report",
      sections,
      colorScheme: "professional",
      tableOfContents: true,
      ...options,
    },
    outputPath
  );
}

export async function createProposal(
  title: string,
  sections: DocumentSection[],
  outputPath: string,
  options?: Partial<DocumentConfig>
): Promise<{ texPath: string; pdfPath: string | null }> {
  return createDocument(
    {
      title,
      type: "proposal",
      sections,
      colorScheme: "corporate",
      tableOfContents: false,
      ...options,
    },
    outputPath
  );
}

export default {
  generateLatexDocument,
  compileLatexToPdf,
  createDocument,
  createWhitepaper,
  createReport,
  createProposal,
  COLOR_SCHEMES,
};
