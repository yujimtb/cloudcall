#!/bin/sh
# Install PulseAudio, Google Chrome and Jami into vendor/ without root.
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/lib/common.sh"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1
CACHE="$VENDOR/.cache"
DEBIAN=https://deb.debian.org/debian
DEBIAN_INDEX=dists/trixie/main/binary-amd64/Packages.xz

install_component() {
    name=$1
    shift
    if [ -d "$VENDOR/$name" ] && [ "$FORCE" = 0 ]; then
        echo "[$name] already installed (use --force to reinstall)"
        return
    fi
    echo "[$name] installing"
    rm -rf "$VENDOR/$name.tmp"
    "$@" "$VENDOR/$name.tmp"
    rm -rf "$VENDOR/$name"
    mv "$VENDOR/$name.tmp" "$VENDOR/$name"
}

pulseaudio() {
    python3 "$ROOT/install/fetch-debs.py" --repo "$DEBIAN" --index "$DEBIAN_INDEX" --cache "$CACHE" --dest "$1" \
        pulseaudio pulseaudio-utils libpulsedsp libspeexdsp1 libtdb1 libwebrtc-audio-processing-1-3
}

chrome() {
    deb="$CACHE/google-chrome-stable_current_amd64.deb"
    mkdir -p "$CACHE"
    [ -f "$deb" ] || curl -fL --retry 3 -o "$deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    dpkg-deb -x "$deb" "$1"
}

jami() {
    python3 "$ROOT/install/fetch-debs.py" --repo https://dl.jami.net/stable/debian_13 --index dists/jami/main/binary-amd64/Packages \
        --cache "$CACHE" --dest "$1" jami-all libqt-jami
    python3 "$ROOT/install/fetch-debs.py" --repo "$DEBIAN" --index "$DEBIAN_INDEX" --cache "$CACHE" --dest "$1" \
        libargon2-1 libnm0 libspeexdsp1
}

install_component pulseaudio pulseaudio
install_component chrome chrome
install_component jami jami

echo "Checking shared libraries..."
check() {
    label=$1
    shift
    missing=$("$@" 2>/dev/null | awk '/not found/ {print $1}' | sort -u | tr '\n' ' ')
    if [ -n "$missing" ]; then echo "  $label: MISSING $missing"; else echo "  $label: ok"; fi
}
report=$(
    (pulse_env; check pulseaudio ldd "$VENDOR/pulseaudio/usr/bin/pulseaudio"; check pactl ldd "$VENDOR/pulseaudio/usr/bin/pactl")
    check chrome ldd "$VENDOR/chrome/opt/google/chrome/chrome"
    (jami_env; check jami ldd "$VENDOR/jami/usr/bin/jami"; check libjami-core ldd "$VENDOR/jami/usr/lib/x86_64-linux-gnu/libjami-core.so")
)
echo "$report"
case "$report" in *MISSING*) exit 1 ;; esac
