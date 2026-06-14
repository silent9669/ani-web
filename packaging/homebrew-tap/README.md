# Homebrew tap for ani-desk

This directory contains files that are copied into `silent9669/homebrew-ani-desk` by the ani-desk release workflow.

User install command:

```bash
brew install --cask silent9669/ani-desk/ani-desk
```

The cask installs the Apple Silicon macOS 15+ `.app` from the release DMG into Applications. Artifacts are unsigned; if macOS blocks first launch, run:

```bash
xattr -cr /Applications/ani-desk.app
```
