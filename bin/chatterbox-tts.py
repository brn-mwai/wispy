#!/usr/bin/env python3
"""
Chatterbox TTS Script for Wispy
Generates natural, emotional speech from text

Usage:
  python chatterbox-tts.py "Hello world" output.wav [exaggeration] [cfg]

Arguments:
  text: Text to synthesize (supports emotion tags like [laugh], [sigh])
  output: Output WAV file path
  exaggeration: Emotion intensity 0-1 (default: 0.5)
  cfg: CFG/pace value 0-1 (default: 0.5, lower=faster)
"""

import sys
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: python chatterbox-tts.py \"text\" output.wav [exaggeration] [cfg]")
        sys.exit(1)

    text = sys.argv[1]
    output_path = sys.argv[2]
    exaggeration = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    cfg = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5

    # Suppress warnings
    import warnings
    warnings.filterwarnings("ignore")

    print(f"[Chatterbox] Generating speech...")
    print(f"[Chatterbox] Text: {text[:50]}...")
    print(f"[Chatterbox] Exaggeration: {exaggeration}, CFG: {cfg}")

    try:
        import torch
        from chatterbox.tts import ChatterboxTTS

        # Detect device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Chatterbox] Using device: {device}")

        # Load model (will cache after first run)
        print("[Chatterbox] Loading model...")
        model = ChatterboxTTS.from_pretrained(device=device)

        # Generate speech
        print("[Chatterbox] Generating audio...")
        wav = model.generate(
            text,
            exaggeration=exaggeration,
            cfg_weight=cfg
        )

        # Save output
        import torchaudio

        # Ensure output directory exists
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)

        torchaudio.save(output_path, wav, model.sr)

        print(f"[Chatterbox] SUCCESS: {output_path}")
        print(f"[Chatterbox] Sample rate: {model.sr}")

    except Exception as e:
        print(f"[Chatterbox] ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
