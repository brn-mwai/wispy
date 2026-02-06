# Homebrew Tap Setup

To make `brew tap brn-mwai/wispy && brew install wispy` work:

## 1. Create GitHub Repo
Create a repo named `homebrew-wispy` at `github.com/brn-mwai/homebrew-wispy`

## 2. Add Formula
Copy `wispy.rb` to `Formula/wispy.rb` in that repo.

## 3. Update SHA256
After publishing to npm, get the SHA:
```bash
npm pack wispy-ai
shasum -a 256 wispy-ai-1.0.0.tgz
```
Update the `sha256` field in the formula.

## 4. Update Version
When publishing new versions, update `url` and `sha256` in the formula.

## Structure
```
homebrew-wispy/
  Formula/
    wispy.rb
  README.md
```

## Usage
```bash
brew tap brn-mwai/wispy
brew install wispy
wispy setup
wispy gateway
```
