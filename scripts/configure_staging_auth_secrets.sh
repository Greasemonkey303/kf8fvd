#!/bin/sh
set -eu

PATH="$HOME/.local/bin:$PATH"
export PATH

: "${PLAYWRIGHT_TEST_EMAIL:?Set PLAYWRIGHT_TEST_EMAIL in this terminal}"
: "${PLAYWRIGHT_TEST_PASSWORD:?Set PLAYWRIGHT_TEST_PASSWORD in this terminal}"
STAGING_SITE_URL=${STAGING_SITE_URL:-https://www.kf8fvd.com}
REPOSITORY=${GITHUB_REPOSITORY:-Greasemonkey303/kf8fvd}

if ! command -v gh >/dev/null 2>&1; then
  printf 'GitHub CLI (gh) is required. Install it for this user and retry.\n' >&2
  exit 1
fi

TOKEN=${GH_TOKEN:-}
if [ -z "$TOKEN" ]; then
  TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | sed -n 's/^password=//p')
fi
if [ -z "$TOKEN" ]; then
  printf 'No GitHub authentication is available. Run gh auth login and retry.\n' >&2
  exit 1
fi
export GH_TOKEN="$TOKEN"

gh api --method PUT "repos/$REPOSITORY/environments/staging" >/dev/null
gh variable set SITE_URL --env staging --repo "$REPOSITORY" --body "$STAGING_SITE_URL"
printf '%s' "$PLAYWRIGHT_TEST_EMAIL" | gh secret set PLAYWRIGHT_TEST_EMAIL --env staging --repo "$REPOSITORY"
printf '%s' "$PLAYWRIGHT_TEST_PASSWORD" | gh secret set PLAYWRIGHT_TEST_PASSWORD --env staging --repo "$REPOSITORY"

SECRET_NAMES=$(gh secret list --env staging --repo "$REPOSITORY" --json name --jq '.[].name' | sort)
for required in PLAYWRIGHT_TEST_EMAIL PLAYWRIGHT_TEST_PASSWORD; do
  if ! printf '%s\n' "$SECRET_NAMES" | grep -qx "$required"; then
    printf 'Failed to verify staging secret name: %s\n' "$required" >&2
    exit 1
  fi
done

unset TOKEN GH_TOKEN PLAYWRIGHT_TEST_EMAIL PLAYWRIGHT_TEST_PASSWORD
printf 'Staging auth secret names and SITE_URL are configured for %s.\n' "$REPOSITORY"
