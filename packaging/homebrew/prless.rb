require "language/node"

# Homebrew formula for macOS / Linux. It installs the published npm package and
# its runtime dependencies into the Cellar, then symlinks the `prless` command.
#
# Before this works you must:
#   1. Publish to npm:  npm publish
#   2. Fill in the sha256 of the published tarball (see packaging/README.md).
#   3. Host this file in a tap repo named `homebrew-<tap>` so users can run:
#        brew install muhammadZihad/tap/prless
class Prless < Formula
  desc "Local GitHub-style code review tool with agent-agnostic AI handoff"
  homepage "https://www.npmjs.com/package/@muhammad_zihad/prless"
  url "https://registry.npmjs.org/@muhammad_zihad/prless/-/prless-0.1.0.tgz"
  sha256 "REPLACE_WITH_PUBLISHED_TARBALL_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "agent-agnostic", shell_output("#{bin}/prless help")
  end
end
