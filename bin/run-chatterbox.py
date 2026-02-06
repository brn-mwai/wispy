#!/usr/bin/env python3
"""
Chatterbox TTS - Memory-optimized runner
Runs in isolated process to avoid memory conflicts
"""
import sys
import os
import gc
import warnings
warnings.filterwarnings("ignore")

def main():
    if len(sys.argv) < 3:
        print("Usage: python run-chatterbox.py <text> <output.wav> [exaggeration]")
        sys.exit(1)

    text = sys.argv[1]
    output_path = sys.argv[2]
    exaggeration = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5

    # Force garbage collection
    gc.collect()

    print(f"[Chatterbox] Text: {text[:50]}...")
    print(f"[Chatterbox] Output: {output_path}")

    try:
        import torch

        # Memory optimization settings
        torch.set_num_threads(2)  # Limit CPU threads

        print("[Chatterbox] Loading model (this may take a moment)...")

        from chatterbox.tts import ChatterboxTTS

        # Try to load with minimal memory footprint
        device = "cpu"  # Force CPU to avoid GPU memory issues
        model = ChatterboxTTS.from_pretrained(device=device)

        print("[Chatterbox] Model loaded, generating audio...")

        # Generate
        wav = model.generate(text, exaggeration=exaggeration)

        # Free model memory before saving
        del model
        gc.collect()

        # Save
        import torchaudio
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        torchaudio.save(output_path, wav, 24000)  # Chatterbox uses 24kHz

        if os.path.exists(output_path):
            size = os.path.getsize(output_path)
            print(f"[Chatterbox] SUCCESS! Saved {size} bytes to {output_path}")
            sys.exit(0)
        else:
            print("[Chatterbox] ERROR: File not created")
            sys.exit(1)

    except MemoryError:
        print("[Chatterbox] ERROR: Out of memory. Close some applications and try again.")
        sys.exit(2)
    except Exception as e:
        print(f"[Chatterbox] ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
