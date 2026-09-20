#!/usr/bin/env bash
# Push to GitHub.
#
# git 2.19.2 (2018, shipped with the Xcode CLT here) cannot authenticate to
# GitHub through the osxkeychain credential helper — the token is valid and the
# helper stores it, but the push is refused with "Invalid username or token".
# Reading the token out of the keychain and passing it inline works.
#
# The token is never written to .git/config or anywhere on disk.
set -euo pipefail
BRANCH="${1:-main}"
TOKEN=$(printf 'protocol=https\nhost=github.com\nusername=a1noh\n\n' \
  | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
if [ -z "$TOKEN" ]; then
  echo "No GitHub token in the keychain. Re-add it with:" >&2
  echo "  printf 'protocol=https\\nhost=github.com\\nusername=a1noh\\npassword=<token>\\n\\n' | git credential approve" >&2
  exit 1
fi
git -c credential.helper= push "https://a1noh:${TOKEN}@github.com/a1noh/soonot.git" "${BRANCH}:${BRANCH}"
