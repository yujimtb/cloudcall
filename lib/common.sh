# Shared settings for CloudCall scripts. Source after setting ROOT.
VENDOR="$ROOT/vendor"
STATE="$ROOT/state"
PRIVATE="$ROOT/private"
CALL_ENV="$PRIVATE/call.env"
SECRETS_REPO="${CLOUDCALL_SECRETS_REPO:-yujimitobe/cloudcall-secrets}"

if [ -z "${XDG_RUNTIME_DIR:-}" ] || [ ! -d "$XDG_RUNTIME_DIR" ]; then
    XDG_RUNTIME_DIR=$(ls -dt /dev/shm/codex-orbit-desktop/runtime-* 2>/dev/null | head -n 1)
    [ -n "$XDG_RUNTIME_DIR" ] || XDG_RUNTIME_DIR="/tmp/cloudcall-runtime-$(id -u)"
    export XDG_RUNTIME_DIR
fi
PULSE_SOCKET="${CLOUDCALL_PULSE_SOCKET:-$XDG_RUNTIME_DIR/pulse/native}"
export PULSE_SERVER="unix:$PULSE_SOCKET"

if [ -z "${HTTPS_PROXY:-}${https_proxy:-}" ] && getent hosts browser-proxy >/dev/null 2>&1; then
    export HTTPS_PROXY=http://browser-proxy:8889 HTTP_PROXY=http://browser-proxy:8889
fi
for cert in "${CODEX_PROXY_CERT:-}" /usr/local/share/ca-certificates/nebula-dns.crt; do
    if [ -n "$cert" ] && [ -f "$cert" ]; then
        export NODE_EXTRA_CA_CERTS="$cert"
        break
    fi
done

pulse_env() {
    PA="$VENDOR/pulseaudio"
    PA_MODULES=$(ls -d "$PA"/usr/lib/pulse-*/modules 2>/dev/null | head -n 1)
    export LD_LIBRARY_PATH="$PA/usr/lib/x86_64-linux-gnu:$PA/usr/lib/x86_64-linux-gnu/pulseaudio:$PA_MODULES${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
}

jami_env() {
    J="$VENDOR/jami"
    export LD_LIBRARY_PATH="$J/usr/lib/libqt-jami/lib:$J/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
    export QT_PLUGIN_PATH="$J/usr/lib/libqt-jami/plugins"
    export QML2_IMPORT_PATH="$J/usr/lib/libqt-jami/qml"
    export XDG_DATA_DIRS="$J/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
    export XDG_CONFIG_HOME="$STATE/jami/config"
    export XDG_DATA_HOME="$STATE/jami/data"
    export XDG_CACHE_HOME="$STATE/jami/cache"
}

chrome_bin() {
    printf '%s\n' "$VENDOR/chrome/opt/google/chrome/google-chrome"
}

chrome_env() {
    export XDG_CONFIG_HOME="$STATE/chrome/config"
    export XDG_CACHE_HOME="$STATE/chrome/cache"
    export XDG_DATA_HOME="$STATE/chrome/data"
}

require_call_env() {
    if [ ! -f "$CALL_ENV" ]; then
        echo "Missing $CALL_ENV. Run bin/restore-secrets, or relay/deploy to create a new relay." >&2
        exit 1
    fi
    . "$CALL_ENV"
}
