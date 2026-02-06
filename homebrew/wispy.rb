# Homebrew formula for Wispy AI
# To use: brew tap brn-mwai/wispy && brew install wispy
#
# This formula installs wispy-ai from npm globally.
# For the tap repo, create github.com/brn-mwai/homebrew-wispy
# with this file at Formula/wispy.rb

class Wispy < Formula
  desc "Autonomous AI agent with Marathon Mode, powered by Gemini"
  homepage "https://wispy.cc"
  url "https://registry.npmjs.org/wispy-ai/-/wispy-ai-1.0.0.tgz"
  sha256 "" # Update after npm publish: shasum -a 256 wispy-ai-1.0.0.tgz
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  def post_install
    ohai "Wispy AI installed! Run 'wispy setup' to configure."
  end

  test do
    assert_match "wispy", shell_output("#{bin}/wispy --version 2>&1", 0)
  end
end
