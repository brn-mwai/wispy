# Boot Sequence

This file is executed on first run to bootstrap Wispy.

## First Run Checklist
1. Generate Ed25519 device identity keypair
2. Create `.wispy/` runtime directory structure
3. Generate default `config.yaml`
4. Prompt user for Gemini API key (if not in .env)
5. Verify Gemini API connectivity
6. Initialize empty session store
7. Initialize memory database (SQLite + vectors)
8. Display welcome message with Wispy ☁️👀

## Welcome Message
```
  ☁️👀
  Hi! I'm Wispy — your autonomous AI companion.

  I'm powered by Google Gemini 3 and I can:
  • Plan and execute complex tasks autonomously
  • Connect to Telegram, WhatsApp, and more
  • Generate images and create content
  • Manage a crypto wallet for payments
  • Remember everything important about you

  Let's get started! Type 'wispy onboard' to set up.
```
