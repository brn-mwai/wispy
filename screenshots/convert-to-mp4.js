const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const FFMPEG = 'C:\\Users\\Windows\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const files = [
  { name: 'anim-01-goal-thinking', duration: 12 },
  { name: 'anim-02-autonomous-execution', duration: 12 },
  { name: 'anim-03-verification', duration: 12 },
  { name: 'anim-04-self-recovery', duration: 12 },
  { name: 'anim-05-marathon-mode', duration: 14 },
  { name: 'anim-06-omnichannel', duration: 10 },
  { name: 'anim-07-gemini-architecture', duration: 8 },
  { name: 'anim-08-payments-a2a', duration: 8 },
  { name: 'anim-09-finale', duration: 12 },
];

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAMES_DIR = path.join(__dirname, '_frames');

async function convertFile(browser, file) {
  const frameDir = path.join(FRAMES_DIR, file.name);
  if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

  console.log(`\n  Recording: ${file.name} (${file.duration}s at ${FPS}fps)`);

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const htmlPath = path.join(__dirname, `${file.name}.html`);
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

  // First load to cache fonts/icons
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await sleep(2000);

  // Reload to restart all CSS animations cleanly
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await sleep(100);

  // Add a smooth fade-in overlay that matches the background gradient
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'fade-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: linear-gradient(180deg, #8ACFEA 0%, #c5e5f5 50%, #FAFDFF 100%);
      opacity: 1;
      transition: opacity 1.2s cubic-bezier(0.25, 0.1, 0.25, 1);
      pointer-events: none;
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.style.opacity = '0';
      });
    });
  });

  const totalFrames = file.duration * FPS;
  const frameInterval = 1000 / FPS;

  // Capture frames
  for (let i = 0; i < totalFrames; i++) {
    const frameNum = String(i).padStart(5, '0');
    await page.screenshot({
      path: path.join(frameDir, `frame_${frameNum}.png`),
      type: 'png',
    });

    if (i < totalFrames - 1) {
      await sleep(frameInterval);
    }

    // Progress every 2 seconds
    if (i > 0 && i % (FPS * 2) === 0) {
      process.stdout.write(` ${Math.round((i / totalFrames) * 100)}%`);
    }
  }
  console.log(' 100%');

  await page.close();

  // FFmpeg encode with fade-out and high quality
  const outputPath = path.join(__dirname, `${file.name}.mp4`);
  const fadeOutStart = Math.max(0, file.duration - 1.5);
  const ffmpegCmd = [
    `"${FFMPEG}"`,
    '-y',
    `-framerate ${FPS}`,
    `-i "${path.join(frameDir, 'frame_%05d.png')}"`,
    `-vf "fade=t=out:st=${fadeOutStart}:d=1.5,format=yuv420p"`,
    '-c:v libx264',
    '-preset slow',
    '-crf 18',
    '-pix_fmt yuv420p',
    '-movflags +faststart',
    `"${outputPath}"`,
  ].join(' ');

  console.log(`  Encoding ${file.name}.mp4...`);
  try {
    execSync(ffmpegCmd, { stdio: 'pipe' });
    const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`  Done: ${file.name}.mp4 (${size} MB)`);
  } catch (err) {
    console.error(`  FFmpeg error:`, err.stderr?.toString().slice(-500));
  }

  // Clean up frames for this file
  fs.rmSync(frameDir, { recursive: true, force: true });

  return outputPath;
}

async function main() {
  console.log('=== Wispy Animation -> MP4 Converter ===');
  console.log(`${WIDTH}x${HEIGHT} @ ${FPS}fps | ${files.length} files`);
  console.log(`Output dir: ${__dirname}\n`);

  if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--force-color-profile=srgb',
    ],
  });

  const results = [];
  for (const file of files) {
    try {
      const output = await convertFile(browser, file);
      results.push({ name: file.name, ok: true, path: output });
    } catch (err) {
      console.error(`  FAILED: ${file.name}:`, err.message);
      results.push({ name: file.name, ok: false, err: err.message });
    }
  }

  await browser.close();

  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true, force: true });

  console.log('\n=== Summary ===');
  let okCount = 0;
  for (const r of results) {
    if (r.ok) { okCount++; console.log(`  OK  ${r.name}.mp4`); }
    else console.log(`  FAIL ${r.name}: ${r.err}`);
  }
  console.log(`\n${okCount}/${files.length} converted successfully.`);
}

main().catch(console.error);
