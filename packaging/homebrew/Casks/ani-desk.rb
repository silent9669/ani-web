cask "ani-desk" do
  arch arm: "aarch64", intel: "x64"

  version "1.0.0"
  sha256 arm: "PLACEHOLDER_SHA256_ARM64_DMG",
         intel: "PLACEHOLDER_SHA256_X64_DMG"

  url "https://github.com/silent9669/ani-desk/releases/download/v#{version}/ani-desk_#{version}_#{arch}.dmg"
  name "ani-desk"
  desc "Netflix-inspired desktop app for anime streaming"
  homepage "https://github.com/silent9669/ani-desk"

  livecheck do
    url "https://github.com/silent9669/ani-desk/releases/latest"
    strategy :github_latest
  end

  app "ani-desk.app"

  zap trash: [
    "~/Library/Application Support/com.silent9669.ani-desk",
    "~/Library/Caches/com.silent9669.ani-desk",
    "~/Library/Preferences/com.silent9669.ani-desk.plist",
  ]

  caveats <<~EOS
    ani-desk v1.0 artifacts are unsigned. If macOS blocks the first launch,
    open System Settings > Privacy & Security and allow ani-desk.

    mpv is optional for fallback playback:
      brew install mpv
  EOS
end
