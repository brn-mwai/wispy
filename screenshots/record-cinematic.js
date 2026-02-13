const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const FFMPEG = 'C:\\Users\\Windows\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const FRAMES_DIR = path.join(__dirname, '_frames');

// ─── Scene config ───
// No zoom — just slow pacing + slide-up entrance + fade in/out
const scenes = [
  { name: 'anim-01-goal-thinking',       duration: 32, rate: 0.32 },
  { name: 'anim-02-autonomous-execution', duration: 30, rate: 0.32 },
  { name: 'anim-03-verification',         duration: 28, rate: 0.32 },
  { name: 'anim-04-self-recovery',        duration: 30, rate: 0.32 },
  { name: 'anim-05-marathon-mode',        duration: 34, rate: 0.30 },
  { name: 'anim-06-omnichannel',          duration: 26, rate: 0.35 },
  { name: 'anim-07-gemini-architecture',  duration: 24, rate: 0.35 },
  { name: 'anim-08-payments-a2a',         duration: 24, rate: 0.35 },
  { name: 'anim-09-finale',              duration: 30, rate: 0.35 },
];

// Smooth ease-in-out cubic for the slide-up
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function recordScene(browser, scene) {
  const { name, duration, rate } = scene;
  const frameDir = path.join(FRAMES_DIR, name);
  if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

  console.log(`\n  ▶ ${name} (${duration}s, rate=${rate})`);

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const htmlPath = path.join(__dirname, `${name}.html`);
  const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;

  // First load: cache fonts + icons
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await sleep(3000);

  // Reload: fresh start for all animations
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  await sleep(200);

  // Pause all animations, set up slide-up entrance
  await page.evaluate((playbackRate) => {
    // Slow down all CSS animations
    document.getAnimations().forEach(a => {
      a.playbackRate = playbackRate;
    });

    // Observe for new animations and slow them too
    const observer = new MutationObserver(() => {
      document.getAnimations().forEach(a => {
        if (a.playbackRate !== playbackRate) a.playbackRate = playbackRate;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    // Hide content initially for slide-up entrance
    // Find the main card element
    const card = document.querySelector('.card') || document.querySelector('.tg')?.closest('.card');
    if (card) {
      card.style.transition = 'none';
      card.style.transform = 'translateY(120px)';
      card.style.opacity = '0';
    }

    document.body.style.overflow = 'hidden';
  }, rate);

  // Create gradient overlay for fade-in
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'fade-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 99999;
      background: linear-gradient(180deg, #8ACFEA 0%, #c5e5f5 50%, #FAFDFF 100%);
      opacity: 1; pointer-events: none;
    `;
    document.body.appendChild(overlay);
  });

  const totalFrames = duration * FPS;
  const frameInterval = 1000 / FPS;

  // Slide-up entrance timing
  const ENTRANCE_DURATION = 2.0; // seconds
  const ENTRANCE_FRAMES = Math.round(ENTRANCE_DURATION * FPS);
  const SLIDE_DISTANCE = 120; // px from below

  // Fade-in timing (overlay dissolve)
  const FADE_IN_DURATION = 1.5; // seconds
  const FADE_IN_FRAMES = Math.round(FADE_IN_DURATION * FPS);

  for (let i = 0; i < totalFrames; i++) {
    const time = i / FPS;

    // ── Fade-in: dissolve the gradient overlay ──
    if (i <= FADE_IN_FRAMES) {
      const progress = i / FADE_IN_FRAMES;
      const eased = easeInOutCubic(Math.min(progress, 1));
      const opacity = 1 - eased;
      await page.evaluate((op) => {
        const el = document.getElementById('fade-overlay');
        if (el) el.style.opacity = String(op);
      }, opacity);
    } else if (i === FADE_IN_FRAMES + 1) {
      await page.evaluate(() => {
        const el = document.getElementById('fade-overlay');
        if (el) el.remove();
      });
    }

    // ── Slide-up entrance: card rises from below ──
    if (i <= ENTRANCE_FRAMES) {
      const progress = i / ENTRANCE_FRAMES;
      const eased = easeInOutCubic(Math.min(progress, 1));
      const yOffset = SLIDE_DISTANCE * (1 - eased);
      const cardOpacity = eased;

      await page.evaluate((y, op) => {
        const card = document.querySelector('.card');
        if (card) {
          card.style.transition = 'none';
          card.style.transform = `translateY(${y}px)`;
          card.style.opacity = String(op);
        }
      }, yOffset, cardOpacity);
    } else if (i === ENTRANCE_FRAMES + 1) {
      // Lock card in final position
      await page.evaluate(() => {
        const card = document.querySelector('.card');
        if (card) {
          card.style.transform = 'translateY(0)';
          card.style.opacity = '1';
        }
      });
    }

    // ── Re-apply playback rate every 3s (catch new animations) ──
    if (i % (FPS * 3) === 0 && i > 0) {
      await page.evaluate((r) => {
        document.getAnimations().forEach(a => {
          if (a.playbackRate !== r) a.playbackRate = r;
        });
      }, rate);
    }

    // ── Capture frame ──
    const frameNum = String(i).padStart(5, '0');
    await page.screenshot({
      path: path.join(frameDir, `frame_${frameNum}.png`),
      type: 'png',
    });

    if (i < totalFrames - 1) await sleep(frameInterval);

    // Progress log every 4s
    if (i > 0 && i % (FPS * 4) === 0) {
      process.stdout.write(` ${Math.round((i / totalFrames) * 100)}%`);
    }
  }
  console.log(' 100%');
  await page.close();

  // ── FFmpeg encode: fade-out at end, high quality ──
  const outputPath = path.join(__dirname, `${name}.mp4`);
  const fadeOutStart = Math.max(0, duration - 2);
  const cmd = [
    `"${FFMPEG}"`, '-y',
    `-framerate ${FPS}`,
    `-i "${path.join(frameDir, 'frame_%05d.png')}"`,
    `-vf "fade=t=out:st=${fadeOutStart}:d=2,format=yuv420p"`,
    '-c:v libx264', '-preset slow', '-crf 17',
    '-pix_fmt yuv420p', '-movflags +faststart',
    `"${outputPath}"`,
  ].join(' ');

  console.log(`  Encoding...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
    const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
    console.log(`  done: ${name}.mp4 (${size} MB)`);
  } catch (err) {
    console.error(`  FFmpeg error:`, err.stderr?.toString().slice(-400));
  }

  fs.rmSync(frameDir, { recursive: true, force: true });
  return outputPath;
}

async function main() {
  console.log('=== Wispy Cinematic Recorder ===');
  console.log(`${WIDTH}x${HEIGHT} @ ${FPS}fps`);
  console.log(`Slow pacing | Slide-up entrance | Fade in/out`);
  console.log(`No zoom — clean, narration-paced\n`);

  if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      '--no-sandbox', '--disable-setuid-sandbox',
      '--force-color-profile=srgb',
    ],
  });

  const results = [];
  for (const scene of scenes) {
    try {
      const out = await recordScene(browser, scene);
      results.push({ name: scene.name, ok: true });
    } catch (err) {
      console.error(`  FAILED ${scene.name}:`, err.message);
      results.push({ name: scene.name, ok: false, err: err.message });
    }
  }

  await browser.close();
  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true, force: true });

  console.log('\n=== Results ===');
  let ok = 0;
  for (const r of results) {
    if (r.ok) { ok++; console.log(`  OK  ${r.name}.mp4`); }
    else console.log(`  FAIL ${r.name}: ${r.err}`);
  }
  console.log(`\n${ok}/${scenes.length} complete.`);
}

main().catch(console.error);
