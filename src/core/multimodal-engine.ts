/**
 * Multimodal Engine - Full Gemini/Vertex AI Capabilities
 *
 * Combines text, images, audio, and video in unified responses.
 * Generates diagrams, explains visually, and creates rich content.
 */

import { createLogger } from "../infra/logger.js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

const log = createLogger("multimodal");

export interface MultimodalResponse {
  text?: string;
  images?: { path: string; caption?: string; base64?: string }[];
  audio?: { path: string; transcript?: string };
  documents?: { path: string; title?: string }[];
  artifacts?: string[];
}

export interface GenerateOptions {
  includeVisuals?: boolean;      // Generate diagrams/images to explain
  includeAudio?: boolean;        // Generate voice explanation
  includeDocument?: boolean;     // Generate PDF document
  style?: "conversational" | "professional" | "educational";
}

/**
 * Get Gemini client
 */
async function getGeminiClient() {
  const { getClient } = await import("../ai/gemini.js");
  return getClient();
}

/**
 * Generate an image using Gemini/Imagen
 */
export async function generateImage(
  prompt: string,
  outputDir: string,
  options: { style?: string; aspectRatio?: string } = {}
): Promise<string | null> {
  try {
    const ai = await getGeminiClient();

    // Use Imagen 3 for high-quality images
    const result = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: options.aspectRatio || "1:1",
        outputMimeType: "image/png",
      },
    });

    if (result.generatedImages && result.generatedImages.length > 0) {
      const img = result.generatedImages[0];
      if (img.image?.imageBytes) {
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = join(outputDir, `image_${Date.now()}.png`);
        const buffer = Buffer.from(img.image.imageBytes, "base64");
        writeFileSync(outputPath, buffer);
        log.info("Generated image: %s", outputPath);
        return outputPath;
      }
    }
    return null;
  } catch (err: any) {
    log.error("Image generation failed: %s", err.message);
    return null;
  }
}

/**
 * Generate diagram for explanation using Gemini
 */
export async function generateDiagram(
  concept: string,
  outputDir: string,
  diagramType: "flowchart" | "architecture" | "concept" | "process" = "concept"
): Promise<string | null> {
  const diagramPrompts: Record<string, string> = {
    flowchart: `Create a clean, professional flowchart diagram illustrating: ${concept}. Use clear boxes, arrows, and labels. Minimal, modern design with good contrast.`,
    architecture: `Create a clean system architecture diagram showing: ${concept}. Use boxes for components, lines for connections, clear labels. Professional technical style.`,
    concept: `Create an educational diagram explaining the concept of: ${concept}. Visual, clear, with labels and annotations. Suitable for learning.`,
    process: `Create a step-by-step process diagram for: ${concept}. Show each step clearly with arrows indicating flow. Professional infographic style.`,
  };

  return generateImage(diagramPrompts[diagramType], outputDir, { aspectRatio: "16:9" });
}

/**
 * Generate natural conversational voice using Gemini 2.0
 */
export async function generateNaturalVoice(
  text: string,
  outputDir: string,
  options: { voice?: string; style?: string } = {}
): Promise<string | null> {
  try {
    const ai = await getGeminiClient();

    // Clean text for speech
    const cleanText = text
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/\[.*?\]/g, "")
      .slice(0, 800); // Limit length

    // Use Gemini 2.0 Flash with audio output
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [{
        role: "user",
        parts: [{
          text: `Please say this in a warm, friendly, conversational voice like you're chatting with a friend. Be natural and expressive: "${cleanText}"`
        }],
      }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: options.voice || "Kore", // Kore is warm and natural
            },
          },
        },
      } as any,
    });

    // Extract audio from response
    const candidate = result.candidates?.[0];
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        const p = part as any;
        if (p.inlineData?.mimeType?.startsWith("audio/")) {
          if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
          }
          const ext = p.inlineData.mimeType.includes("wav") ? "wav" : "mp3";
          const outputPath = join(outputDir, `voice_${Date.now()}.${ext}`);
          const audioBuffer = Buffer.from(p.inlineData.data, "base64");
          writeFileSync(outputPath, audioBuffer);
          log.info("Generated natural voice: %s", outputPath);
          return outputPath;
        }
      }
    }
    return null;
  } catch (err: any) {
    log.error("Voice generation failed: %s", err.message);
    return null;
  }
}

/**
 * Analyze an image and explain it
 */
export async function analyzeAndExplain(
  imagePath: string,
  question?: string
): Promise<string> {
  try {
    const ai = await getGeminiClient();
    const imageBuffer = readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");
    const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

    const prompt = question || "Explain what you see in this image in detail. Be helpful and educational.";

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt },
        ],
      }],
    });

    return result.text || "Unable to analyze the image.";
  } catch (err: any) {
    log.error("Image analysis failed: %s", err.message);
    return "Failed to analyze the image.";
  }
}

/**
 * Generate a complete multimodal explanation
 */
export async function generateMultimodalExplanation(
  topic: string,
  outputDir: string,
  options: GenerateOptions = {}
): Promise<MultimodalResponse> {
  const response: MultimodalResponse = {
    images: [],
    artifacts: [],
  };

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    const ai = await getGeminiClient();

    // Generate text explanation
    const textResult = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Explain "${topic}" clearly and comprehensively. ${
            options.style === "educational" ? "Use simple language suitable for learning." :
            options.style === "conversational" ? "Be friendly and engaging." :
            "Be professional and thorough."
          }`
        }],
      }],
    });
    response.text = textResult.text || "";

    // Generate visual diagram if requested
    if (options.includeVisuals) {
      const diagramPath = await generateDiagram(topic, outputDir, "concept");
      if (diagramPath) {
        response.images!.push({ path: diagramPath, caption: `Diagram: ${topic}` });
        response.artifacts!.push(diagramPath);
      }
    }

    // Generate audio explanation if requested
    if (options.includeAudio && response.text) {
      const audioPath = await generateNaturalVoice(response.text.slice(0, 500), outputDir);
      if (audioPath) {
        response.audio = { path: audioPath, transcript: response.text.slice(0, 500) };
        response.artifacts!.push(audioPath);
      }
    }

    return response;
  } catch (err: any) {
    log.error("Multimodal generation failed: %s", err.message);
    response.text = `Failed to generate explanation: ${err.message}`;
    return response;
  }
}

/**
 * Create a zip file from a directory
 */
export async function createProjectZip(
  sourceDir: string,
  outputPath: string
): Promise<string | null> {
  try {
    const archiver = await import("archiver");
    const { createWriteStream } = await import("fs");
    const { default: arch } = archiver;

    return new Promise((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = arch("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        log.info("Created zip: %s (%d bytes)", outputPath, archive.pointer());
        resolve(outputPath);
      });

      archive.on("error", (err) => {
        log.error("Zip creation failed: %s", err.message);
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  } catch (err: any) {
    log.error("Zip creation failed: %s", err.message);
    return null;
  }
}

/**
 * Generate LaTeX document with embedded image
 */
export async function generateLatexWithImage(
  title: string,
  content: string,
  imagePath: string,
  imageCaption: string,
  outputDir: string
): Promise<string | null> {
  try {
    const { basename } = await import("path");
    const imageFilename = basename(imagePath);

    // Copy image to output dir
    const { copyFileSync } = await import("fs");
    const destImagePath = join(outputDir, imageFilename);
    copyFileSync(imagePath, destImagePath);

    const latex = `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{graphicx}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{xcolor}
\\geometry{margin=1in}

\\definecolor{primary}{HTML}{2E86AB}
\\definecolor{secondary}{HTML}{1B2A3D}

\\title{\\color{primary}${title.replace(/[&%$#_{}~^\\]/g, "\\$&")}}
\\author{Generated by Wispy AI}
\\date{\\today}

\\begin{document}
\\maketitle

\\section*{Overview}
${content.replace(/[&%$#_{}~^\\]/g, "\\$&")}

\\begin{figure}[h]
\\centering
\\includegraphics[width=0.8\\textwidth]{${imageFilename}}
\\caption{${imageCaption.replace(/[&%$#_{}~^\\]/g, "\\$&")}}
\\end{figure}

\\end{document}
`;

    const texPath = join(outputDir, `${title.replace(/[^a-zA-Z0-9]/g, "_")}.tex`);
    writeFileSync(texPath, latex);
    log.info("Generated LaTeX with image: %s", texPath);
    return texPath;
  } catch (err: any) {
    log.error("LaTeX generation failed: %s", err.message);
    return null;
  }
}

export default {
  generateImage,
  generateDiagram,
  generateNaturalVoice,
  analyzeAndExplain,
  generateMultimodalExplanation,
  createProjectZip,
  generateLatexWithImage,
};
