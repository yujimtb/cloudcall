#!/bin/sh
# One-shot setup for a fresh cloud PC. Safe to re-run.
set -eu
ROOT=$(cd "$(dirname "$0")" && pwd)
. "$ROOT/lib/common.sh"
DESKTOP_DIR="${CLOUDCALL_DESKTOP_DIR:-/workspace}"

for tool in curl dpkg-deb python3 node npm openssl git gh; do
    command -v "$tool" >/dev/null || { echo "Required tool not found: $tool" >&2; exit 1; }
done

"$ROOT/install/apps.sh" "$@"
echo "[relay] installing node packages"
(cd "$ROOT/relay" && npm ci --no-audit --no-fund --loglevel=error)
mkdir -p "$STATE/jami/config/jami" "$PRIVATE"
chmod 700 "$PRIVATE"
[ -f "$STATE/jami/config/jami/dring.yml" ] || cp "$ROOT/templates/dring.yml" "$STATE/jami/config/jami/dring.yml"
echo "[audio] starting virtual audio"
"$ROOT/bin/start-audio"
"$ROOT/bin/audioctl" list short sources | awk '{print "  " $2}'

entry() {
    file="$DESKTOP_DIR/$1.desktop"
    cat >"$file" <<ENTRY
[Desktop Entry]
Version=1.0
Type=Application
Name=$1
Comment=$2
Exec=$ROOT/bin/$3
Icon=$4
Terminal=false
Categories=Network;
ENTRY
    chmod 700 "$file"
}
if [ -d "$DESKTOP_DIR" ]; then
    CHROME_ICON="$VENDOR/chrome/opt/google/chrome/product_logo_128.png"
    JAMI_ICON="$VENDOR/jami/usr/share/icons/hicolor/scalable/apps/net.jami.Jami.svg"
    entry "CloudCall Chrome (Dot)" "Google Chrome for ChatGPT voice, wired to Dot's audio lines" chrome "$CHROME_ICON"
    entry "CloudCall Jami (Dot)" "Jami through the Cloudflare tunnel; call yujimtb to ring the iPhone" jami "$JAMI_ICON"
    entry "CloudCall Call iPhone (browser)" "Browser call with ntfy ring and QR code" call-iphone call-start
    echo "[desktop] shortcuts written to $DESKTOP_DIR"
fi

echo
if [ -f "$CALL_ENV" ]; then
    echo "Done. Secrets are present; use the CloudCall shortcuts."
else
    cat <<NEXT
Done. Secrets are not restored yet. Next:
  1. gh auth status || gh auth login      (GitHub login, needed for the private secrets repo)
  2. $ROOT/bin/restore-secrets            (asks for your backup passphrase)
Without a backup: save a Cloudflare API token to $PRIVATE/cf-token and run $ROOT/relay/deploy,
then import the dot Jami account (.jac) in Jami.
NEXT
fi
