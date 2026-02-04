/**
 * Document Generator
 * Generates professional documents using multiple backends:
 * 1. PDFKit (Node.js native - no external dependencies)
 * 2. jsPDF (Browser-compatible)
 * 3. LaTeX (if installed - highest quality)
 *
 * Supports charts, flowcharts, tables, and various document types
 */

import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { resolve, dirname, basename, join } from "path";
import { createLogger } from "../infra/logger.js";

const execAsync = promisify(exec);
const log = createLogger("document-generator");

// Check available backends
let latexAvailable: boolean | null = null;

async function checkLatex(): Promise<boolean> {
  if (latexAvailable !== null) return latexAvailable;

  try {
    await execAsync("pdflatex --version");
    latexAvailable = true;
    log.info("LaTeX (pdflatex) is available");
  } catch {
    try {
      await execAsync("xelatex --version");
      latexAvailable = true;
      log.info("LaTeX (xelatex) is available");
    } catch {
      latexAvailable = false;
      log.info("LaTeX not found, using PDFKit backend");
    }
  }

  return latexAvailable;
}

export interface DocumentOptions {
  title: string;
  type: "report" | "paper" | "proposal" | "whitepaper" | "presentation" | "letter" | "invoice" | "contract";
  content: string;
  outputPath: string;
  author?: string;
  date?: string;
  logo?: string;
}

export interface ChartOptions {
  chartType: "bar" | "line" | "pie" | "area" | "scatter" | "doughnut";
  title: string;
  data: {
    labels: string[];
    datasets: Array<{ name: string; values: number[]; color?: string }>;
  };
  outputPath: string;
  width?: number;
  height?: number;
}

export interface FlowchartOptions {
  diagramType: "flowchart" | "sequence" | "architecture" | "mindmap" | "timeline" | "org-chart";
  title?: string;
  nodes: Array<{ id: string; label: string; type?: "start" | "process" | "decision" | "end" | "io" }>;
  connections: Array<{ from: string; to: string; label?: string }>;
  outputPath: string;
}

export interface TableOptions {
  headers: string[];
  rows: string[][];
  title?: string;
  outputPath: string;
  style?: "modern" | "classic" | "minimal";
}

export interface ResearchReportOptions {
  topic: string;
  sections: Array<{ title: string; content: string }>;
  charts?: ChartOptions[];
  references?: Array<{ author: string; title: string; year: string; url?: string }>;
  outputPath: string;
}

// Color palette
const COLORS = [
  "#4285F4", "#EA4335", "#FBBC04", "#34A853", "#FF6D01",
  "#46BDC6", "#7BAAF7", "#F07B72", "#FCD04F", "#57BB8A"
];

/**
 * Create a professional document using PDFKit
 */
export async function createDocument(options: DocumentOptions): Promise<string> {
  const outputDir = dirname(options.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const pdfPath = options.outputPath.endsWith(".pdf")
    ? options.outputPath
    : options.outputPath + ".pdf";

  try {
    const PDFDocument = (await import("pdfkit")).default;

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: options.title,
        Author: options.author || "Wispy AI",
        Creator: "Wispy Document Generator",
      },
    });

    const stream = (await import("fs")).createWriteStream(pdfPath);
    doc.pipe(stream);

    // Document styling based on type
    const styles = getDocumentStyles(options.type);

    // Title page
    doc.fontSize(32)
       .fillColor(styles.primaryColor)
       .text(options.title, { align: "center" });

    doc.moveDown(0.5);

    if (options.type !== "letter") {
      doc.fontSize(14)
         .fillColor(styles.secondaryColor)
         .text(getDocumentTypeLabel(options.type), { align: "center" });
    }

    doc.moveDown(2);

    doc.fontSize(12)
       .fillColor("#666666")
       .text(options.author || "Wispy AI", { align: "center" });

    doc.moveDown(0.3);
    doc.text(options.date || new Date().toLocaleDateString(), { align: "center" });

    // New page for content
    if (options.type !== "letter" && options.type !== "invoice") {
      doc.addPage();
    } else {
      doc.moveDown(4);
    }

    // Parse and render content
    await renderContent(doc, options.content, styles);

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });

    log.info("PDF created: %s", pdfPath);
    return pdfPath;
  } catch (err) {
    log.error("PDFKit error: %s", err);

    // Fallback: try LaTeX if available
    const hasLatex = await checkLatex();
    if (hasLatex) {
      return createDocumentWithLatex(options);
    }

    throw err;
  }
}

/**
 * Generate a chart using pure SVG (no external canvas dependencies)
 */
export async function createChart(options: ChartOptions): Promise<string> {
  const outputDir = dirname(options.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Create SVG chart
    const svgPath = createSvgChart(options);

    // Try to convert to PNG using sharp
    const outputPath = options.outputPath.endsWith(".png")
      ? options.outputPath
      : options.outputPath.replace(/\.(svg|pdf)$/i, "") + ".png";

    try {
      const sharp = (await import("sharp")).default;
      const svgContent = readFileSync(svgPath);
      await sharp(svgContent)
        .png()
        .toFile(outputPath);

      log.info("Chart created (PNG): %s", outputPath);
      return outputPath;
    } catch {
      // PNG conversion failed, return SVG
      log.info("Chart created (SVG): %s", svgPath);
      return svgPath;
    }
  } catch (err) {
    log.error("Chart generation error: %s", err);
    throw err;
  }
}

/**
 * Generate a flowchart/diagram
 */
export async function createFlowchart(options: FlowchartOptions): Promise<string> {
  const outputDir = dirname(options.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Generate SVG diagram
    const svg = generateFlowchartSvg(options);

    const svgPath = options.outputPath.replace(/\.(png|pdf)$/i, "") + ".svg";
    writeFileSync(svgPath, svg);

    // Convert to PNG using sharp
    const outputPath = options.outputPath.endsWith(".png")
      ? options.outputPath
      : options.outputPath + ".png";

    try {
      const sharp = (await import("sharp")).default;
      await sharp(Buffer.from(svg))
        .png()
        .toFile(outputPath);

      log.info("Flowchart created: %s", outputPath);
      return outputPath;
    } catch {
      log.info("SVG flowchart created: %s", svgPath);
      return svgPath;
    }
  } catch (err) {
    log.error("Flowchart generation error: %s", err);
    throw err;
  }
}

/**
 * Generate a table as image
 */
export async function createTable(options: TableOptions): Promise<string> {
  const outputDir = dirname(options.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    const svg = generateTableSvg(options);

    const svgPath = options.outputPath.replace(/\.(png|pdf)$/i, "") + ".svg";
    writeFileSync(svgPath, svg);

    const outputPath = options.outputPath.endsWith(".png")
      ? options.outputPath
      : options.outputPath + ".png";

    try {
      const sharp = (await import("sharp")).default;
      await sharp(Buffer.from(svg))
        .png()
        .toFile(outputPath);

      log.info("Table created: %s", outputPath);
      return outputPath;
    } catch {
      log.info("SVG table created: %s", svgPath);
      return svgPath;
    }
  } catch (err) {
    log.error("Table generation error: %s", err);
    throw err;
  }
}

/**
 * Generate a research report
 */
export async function createResearchReport(options: ResearchReportOptions): Promise<string> {
  // Build content from sections
  let content = "";

  // Executive summary
  const summarySection = options.sections.find(s =>
    s.title.toLowerCase().includes("summary") || s.title.toLowerCase().includes("abstract")
  );

  if (summarySection) {
    content += `## Executive Summary\n\n${summarySection.content}\n\n---\n\n`;
  }

  // Main sections
  for (const section of options.sections) {
    if (section === summarySection) continue;
    content += `## ${section.title}\n\n${section.content}\n\n`;
  }

  // References
  if (options.references && options.references.length > 0) {
    content += `## References\n\n`;
    for (let i = 0; i < options.references.length; i++) {
      const ref = options.references[i];
      content += `${i + 1}. ${ref.author} (${ref.year}). *${ref.title}*.`;
      if (ref.url) {
        content += ` ${ref.url}`;
      }
      content += `\n`;
    }
  }

  return createDocument({
    title: options.topic,
    type: "report",
    content,
    outputPath: options.outputPath,
    author: "Wispy AI Research Agent",
    date: new Date().toLocaleDateString(),
  });
}

/**
 * Compile LaTeX to PDF
 */
export async function compileLaTeX(texPath: string, outputDir?: string): Promise<string> {
  const dir = outputDir || dirname(texPath);
  const name = basename(texPath, ".tex");

  try {
    await execAsync(`pdflatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`, {
      cwd: dir,
      timeout: 60000,
    });

    // Second pass for TOC
    await execAsync(`pdflatex -interaction=nonstopmode -output-directory="${dir}" "${texPath}"`, {
      cwd: dir,
      timeout: 60000,
    });

    // Clean up
    const auxFiles = [".aux", ".log", ".out", ".toc", ".nav", ".snm"];
    for (const ext of auxFiles) {
      const auxPath = join(dir, name + ext);
      if (existsSync(auxPath)) {
        try { unlinkSync(auxPath); } catch {}
      }
    }

    const pdfPath = join(dir, name + ".pdf");
    log.info("PDF compiled: %s", pdfPath);
    return pdfPath;
  } catch (err) {
    log.error("LaTeX compilation error: %s", err);
    throw err;
  }
}

// ============ Helper Functions ============

function getDocumentStyles(type: string): { primaryColor: string; secondaryColor: string; accentColor: string } {
  const styles: Record<string, any> = {
    report: { primaryColor: "#2962FF", secondaryColor: "#666666", accentColor: "#00C853" },
    paper: { primaryColor: "#1A237E", secondaryColor: "#455A64", accentColor: "#D32F2F" },
    whitepaper: { primaryColor: "#0066CC", secondaryColor: "#333333", accentColor: "#FF9900" },
    proposal: { primaryColor: "#009688", secondaryColor: "#607D8B", accentColor: "#FF5722" },
    presentation: { primaryColor: "#673AB7", secondaryColor: "#9E9E9E", accentColor: "#FFC107" },
    letter: { primaryColor: "#212121", secondaryColor: "#424242", accentColor: "#1976D2" },
    invoice: { primaryColor: "#2962FF", secondaryColor: "#757575", accentColor: "#4CAF50" },
    contract: { primaryColor: "#263238", secondaryColor: "#546E7A", accentColor: "#D32F2F" },
  };
  return styles[type] || styles.report;
}

function getDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    report: "Technical Report",
    paper: "Research Paper",
    whitepaper: "Whitepaper",
    proposal: "Business Proposal",
    presentation: "Presentation",
    letter: "Letter",
    invoice: "Invoice",
    contract: "Contract Agreement",
  };
  return labels[type] || "Document";
}

async function renderContent(doc: any, content: string, styles: any): Promise<void> {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      doc.moveDown(0.5);
      continue;
    }

    // Headers
    if (trimmed.startsWith("## ")) {
      doc.moveDown(1);
      doc.fontSize(18)
         .fillColor(styles.primaryColor)
         .text(trimmed.slice(3), { underline: false });
      doc.moveDown(0.5);
    } else if (trimmed.startsWith("### ")) {
      doc.moveDown(0.8);
      doc.fontSize(14)
         .fillColor(styles.secondaryColor)
         .text(trimmed.slice(4));
      doc.moveDown(0.3);
    } else if (trimmed.startsWith("# ")) {
      doc.moveDown(1.5);
      doc.fontSize(24)
         .fillColor(styles.primaryColor)
         .text(trimmed.slice(2));
      doc.moveDown(1);
    }
    // Horizontal rule
    else if (trimmed === "---" || trimmed === "***") {
      doc.moveDown(0.5);
      const y = doc.y;
      doc.strokeColor("#CCCCCC")
         .lineWidth(1)
         .moveTo(72, y)
         .lineTo(doc.page.width - 72, y)
         .stroke();
      doc.moveDown(0.5);
    }
    // List items
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      doc.fontSize(11)
         .fillColor("#333333")
         .text(`• ${trimmed.slice(2)}`, { indent: 20 });
    }
    // Numbered list
    else if (/^\d+\.\s/.test(trimmed)) {
      doc.fontSize(11)
         .fillColor("#333333")
         .text(trimmed, { indent: 20 });
    }
    // Bold text (simple parsing)
    else if (trimmed.includes("**")) {
      const parts = trimmed.split(/\*\*(.*?)\*\*/g);
      const textRuns: Array<{ text: string; bold: boolean }> = [];

      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          textRuns.push({ text: parts[i], bold: i % 2 === 1 });
        }
      }

      doc.fontSize(11).fillColor("#333333");
      for (const run of textRuns) {
        if (run.bold) {
          doc.font("Helvetica-Bold").text(run.text, { continued: true });
        } else {
          doc.font("Helvetica").text(run.text, { continued: true });
        }
      }
      doc.text(""); // End the line
    }
    // Regular paragraph
    else {
      doc.fontSize(11)
         .fillColor("#333333")
         .font("Helvetica")
         .text(trimmed, { align: "justify" });
    }
  }
}

function buildChartConfig(options: ChartOptions): any {
  const colors = options.data.datasets.map((ds, i) => ds.color || COLORS[i % COLORS.length]);

  const baseConfig = {
    type: options.chartType === "doughnut" ? "doughnut" : options.chartType,
    data: {
      labels: options.data.labels,
      datasets: options.data.datasets.map((ds, i) => ({
        label: ds.name,
        data: ds.values,
        backgroundColor: options.chartType === "line" || options.chartType === "scatter"
          ? colors[i]
          : colors[i] + "CC",
        borderColor: colors[i],
        borderWidth: 2,
        fill: options.chartType === "area",
        tension: options.chartType === "line" || options.chartType === "area" ? 0.4 : 0,
      })),
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: options.title,
          font: { size: 18, weight: "bold" },
        },
        legend: {
          display: options.data.datasets.length > 1,
          position: "bottom",
        },
      },
      scales: options.chartType !== "pie" && options.chartType !== "doughnut" ? {
        y: {
          beginAtZero: true,
          grid: { color: "#E0E0E0" },
        },
        x: {
          grid: { display: false },
        },
      } : undefined,
    },
  };

  return baseConfig;
}

function createSvgChart(options: ChartOptions): string {
  const width = options.width || 800;
  const height = options.height || 600;
  const padding = 60;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2 - 40;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;

  // Title
  svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#333">${escapeXml(options.title)}</text>`;

  if (options.chartType === "bar") {
    const maxValue = Math.max(...options.data.datasets.flatMap(ds => ds.values));
    const barGroupWidth = chartWidth / options.data.labels.length;
    const barWidth = barGroupWidth * 0.7 / options.data.datasets.length;

    options.data.labels.forEach((label, i) => {
      const x = padding + i * barGroupWidth + barGroupWidth * 0.15;

      options.data.datasets.forEach((ds, j) => {
        const barHeight = (ds.values[i] / maxValue) * chartHeight;
        const barX = x + j * barWidth;
        const barY = padding + 40 + chartHeight - barHeight;
        const color = ds.color || COLORS[j % COLORS.length];

        svg += `<rect x="${barX}" y="${barY}" width="${barWidth - 2}" height="${barHeight}" fill="${color}" rx="2"/>`;
      });

      // X-axis label
      svg += `<text x="${x + barGroupWidth * 0.35}" y="${height - 20}" text-anchor="middle" font-size="12" fill="#666">${escapeXml(label)}</text>`;
    });
  } else if (options.chartType === "pie" || options.chartType === "doughnut") {
    const ds = options.data.datasets[0];
    const total = ds.values.reduce((a, b) => a + b, 0);
    const cx = width / 2;
    const cy = height / 2 + 20;
    const r = Math.min(chartWidth, chartHeight) / 2.5;
    const innerR = options.chartType === "doughnut" ? r * 0.5 : 0;

    let startAngle = -Math.PI / 2;

    ds.values.forEach((value, i) => {
      const angle = (value / total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const color = COLORS[i % COLORS.length];

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      if (innerR > 0) {
        const ix1 = cx + innerR * Math.cos(startAngle);
        const iy1 = cy + innerR * Math.sin(startAngle);
        const ix2 = cx + innerR * Math.cos(endAngle);
        const iy2 = cy + innerR * Math.sin(endAngle);

        svg += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z" fill="${color}"/>`;
      } else {
        svg += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${color}"/>`;
      }

      startAngle = endAngle;
    });

    // Legend
    options.data.labels.forEach((label, i) => {
      const ly = height - 40 + (i % 3) * 15;
      const lx = padding + Math.floor(i / 3) * 150;
      svg += `<rect x="${lx}" y="${ly - 10}" width="12" height="12" fill="${COLORS[i % COLORS.length]}"/>`;
      svg += `<text x="${lx + 18}" y="${ly}" font-size="11" fill="#666">${escapeXml(label)}</text>`;
    });
  } else if (options.chartType === "line" || options.chartType === "area") {
    const maxValue = Math.max(...options.data.datasets.flatMap(ds => ds.values));
    const pointSpacing = chartWidth / (options.data.labels.length - 1);

    options.data.datasets.forEach((ds, j) => {
      const color = ds.color || COLORS[j % COLORS.length];
      let pathD = "";

      ds.values.forEach((value, i) => {
        const x = padding + i * pointSpacing;
        const y = padding + 40 + chartHeight - (value / maxValue) * chartHeight;

        if (i === 0) {
          pathD += `M ${x} ${y}`;
        } else {
          pathD += ` L ${x} ${y}`;
        }
      });

      if (options.chartType === "area") {
        const areaPath = pathD + ` L ${padding + chartWidth} ${padding + 40 + chartHeight} L ${padding} ${padding + 40 + chartHeight} Z`;
        svg += `<path d="${areaPath}" fill="${color}33"/>`;
      }

      svg += `<path d="${pathD}" stroke="${color}" stroke-width="3" fill="none"/>`;

      // Points
      ds.values.forEach((value, i) => {
        const x = padding + i * pointSpacing;
        const y = padding + 40 + chartHeight - (value / maxValue) * chartHeight;
        svg += `<circle cx="${x}" cy="${y}" r="5" fill="${color}"/>`;
      });
    });

    // X-axis labels
    options.data.labels.forEach((label, i) => {
      const x = padding + i * pointSpacing;
      svg += `<text x="${x}" y="${height - 20}" text-anchor="middle" font-size="12" fill="#666">${escapeXml(label)}</text>`;
    });
  }

  svg += `</svg>`;

  const outputPath = options.outputPath.endsWith(".svg")
    ? options.outputPath
    : options.outputPath.replace(/\.(png|pdf)$/i, "") + ".svg";

  writeFileSync(outputPath, svg);
  return outputPath;
}

function generateFlowchartSvg(options: FlowchartOptions): string {
  const nodeWidth = 140;
  const nodeHeight = 50;
  const verticalSpacing = 80;
  const horizontalSpacing = 180;

  // Calculate positions
  const nodePositions: Map<string, { x: number; y: number }> = new Map();
  let cols = Math.ceil(Math.sqrt(options.nodes.length));

  options.nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodePositions.set(node.id, {
      x: 100 + col * horizontalSpacing,
      y: 80 + row * verticalSpacing,
    });
  });

  const width = cols * horizontalSpacing + 150;
  const height = Math.ceil(options.nodes.length / cols) * verticalSpacing + 150;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  svg += `<defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#666"/>
    </marker>
  </defs>`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;

  // Title
  if (options.title) {
    svg += `<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold" fill="#333">${escapeXml(options.title)}</text>`;
  }

  // Draw connections first
  for (const conn of options.connections) {
    const from = nodePositions.get(conn.from);
    const to = nodePositions.get(conn.to);
    if (!from || !to) continue;

    const fromY = from.y + nodeHeight / 2;
    const toY = to.y - nodeHeight / 2 - 8;

    svg += `<line x1="${from.x + nodeWidth / 2}" y1="${from.y + nodeHeight}" x2="${to.x + nodeWidth / 2}" y2="${toY}" stroke="#666" stroke-width="2" marker-end="url(#arrowhead)"/>`;

    if (conn.label) {
      const midX = (from.x + to.x) / 2 + nodeWidth / 2;
      const midY = (from.y + nodeHeight + toY) / 2;
      svg += `<text x="${midX + 10}" y="${midY}" font-size="11" fill="#666">${escapeXml(conn.label)}</text>`;
    }
  }

  // Draw nodes
  for (const node of options.nodes) {
    const pos = nodePositions.get(node.id);
    if (!pos) continue;

    const { x, y } = pos;
    const type = node.type || "process";

    if (type === "start" || type === "end") {
      // Ellipse
      const fill = type === "start" ? "#4CAF50" : "#f44336";
      svg += `<ellipse cx="${x + nodeWidth / 2}" cy="${y + nodeHeight / 2}" rx="${nodeWidth / 2}" ry="${nodeHeight / 2}" fill="${fill}" stroke="${fill}" stroke-width="2"/>`;
      svg += `<text x="${x + nodeWidth / 2}" y="${y + nodeHeight / 2 + 5}" text-anchor="middle" font-size="13" fill="white" font-weight="bold">${escapeXml(node.label)}</text>`;
    } else if (type === "decision") {
      // Diamond
      const cx = x + nodeWidth / 2;
      const cy = y + nodeHeight / 2;
      svg += `<polygon points="${cx},${y} ${x + nodeWidth},${cy} ${cx},${y + nodeHeight} ${x},${cy}" fill="#FFF3E0" stroke="#FF9800" stroke-width="2"/>`;
      svg += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="12" fill="#333">${escapeXml(node.label)}</text>`;
    } else if (type === "io") {
      // Parallelogram
      const skew = 15;
      svg += `<polygon points="${x + skew},${y} ${x + nodeWidth},${y} ${x + nodeWidth - skew},${y + nodeHeight} ${x},${y + nodeHeight}" fill="#E8EAF6" stroke="#3F51B5" stroke-width="2"/>`;
      svg += `<text x="${x + nodeWidth / 2}" y="${y + nodeHeight / 2 + 5}" text-anchor="middle" font-size="12" fill="#333">${escapeXml(node.label)}</text>`;
    } else {
      // Rectangle (process)
      svg += `<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="8" fill="#E3F2FD" stroke="#2196F3" stroke-width="2"/>`;
      svg += `<text x="${x + nodeWidth / 2}" y="${y + nodeHeight / 2 + 5}" text-anchor="middle" font-size="12" fill="#333">${escapeXml(node.label)}</text>`;
    }
  }

  svg += `</svg>`;
  return svg;
}

function generateTableSvg(options: TableOptions): string {
  const cellPadding = 12;
  const rowHeight = 40;
  const colWidths = options.headers.map((h, i) => {
    let maxLen = h.length;
    for (const row of options.rows) {
      if (row[i] && row[i].length > maxLen) {
        maxLen = row[i].length;
      }
    }
    return Math.max(80, maxLen * 9 + cellPadding * 2);
  });

  const totalWidth = colWidths.reduce((a, b) => a + b, 0) + 40;
  const totalHeight = (options.rows.length + 1) * rowHeight + 60 + (options.title ? 40 : 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;

  let startY = 20;

  // Title
  if (options.title) {
    svg += `<text x="${totalWidth / 2}" y="${startY + 15}" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">${escapeXml(options.title)}</text>`;
    startY += 40;
  }

  const style = options.style || "modern";
  const headerBg = style === "modern" ? "#2962FF" : style === "classic" ? "#E0E0E0" : "white";
  const headerText = style === "modern" ? "white" : "#333";

  // Header row
  let x = 20;
  svg += `<rect x="${x}" y="${startY}" width="${totalWidth - 40}" height="${rowHeight}" fill="${headerBg}"/>`;

  for (let i = 0; i < options.headers.length; i++) {
    svg += `<text x="${x + cellPadding}" y="${startY + rowHeight / 2 + 5}" font-size="13" font-weight="bold" fill="${headerText}">${escapeXml(options.headers[i])}</text>`;
    x += colWidths[i];
    if (style === "classic" && i < options.headers.length - 1) {
      svg += `<line x1="${x}" y1="${startY}" x2="${x}" y2="${startY + rowHeight}" stroke="#999" stroke-width="1"/>`;
    }
  }

  // Data rows
  for (let r = 0; r < options.rows.length; r++) {
    const row = options.rows[r];
    const y = startY + (r + 1) * rowHeight;
    const rowBg = r % 2 === 0 ? "#FAFAFA" : "white";

    if (style !== "minimal") {
      svg += `<rect x="20" y="${y}" width="${totalWidth - 40}" height="${rowHeight}" fill="${rowBg}"/>`;
    }

    x = 20;
    for (let i = 0; i < row.length; i++) {
      svg += `<text x="${x + cellPadding}" y="${y + rowHeight / 2 + 5}" font-size="12" fill="#333">${escapeXml(row[i] || "")}</text>`;
      x += colWidths[i];
    }

    if (style === "classic") {
      svg += `<line x1="20" y1="${y + rowHeight}" x2="${totalWidth - 20}" y2="${y + rowHeight}" stroke="#999" stroke-width="1"/>`;
    }
  }

  // Border
  if (style === "classic") {
    svg += `<rect x="20" y="${startY}" width="${totalWidth - 40}" height="${(options.rows.length + 1) * rowHeight}" fill="none" stroke="#999" stroke-width="1"/>`;
  } else if (style === "modern") {
    svg += `<line x1="20" y1="${startY + rowHeight}" x2="${totalWidth - 20}" y2="${startY + rowHeight}" stroke="#2962FF" stroke-width="2"/>`;
  }

  svg += `</svg>`;
  return svg;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// LaTeX fallback for highest quality
async function createDocumentWithLatex(options: DocumentOptions): Promise<string> {
  const template = `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\usepackage{fancyhdr}

\\geometry{margin=1in}

\\definecolor{primary}{RGB}{41, 98, 255}

\\pagestyle{fancy}
\\fancyhf{}
\\rhead{\\textcolor{gray}{\\small ${escapeLatex(options.title)}}}
\\rfoot{\\textcolor{gray}{\\small Page \\thepage}}

\\begin{document}

\\begin{titlepage}
\\centering
\\vspace*{2cm}
{\\Huge\\bfseries\\color{primary} ${escapeLatex(options.title)}\\par}
\\vspace{1cm}
{\\Large ${escapeLatex(options.author || "Wispy AI")}\\par}
\\vspace{0.5cm}
{\\large ${escapeLatex(options.date || new Date().toLocaleDateString())}\\par}
\\vfill
\\end{titlepage}

${options.content}

\\end{document}`;

  const outputDir = dirname(options.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const texPath = options.outputPath + ".tex";
  writeFileSync(texPath, template);

  return compileLaTeX(texPath, outputDir);
}

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
