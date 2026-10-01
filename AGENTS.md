# Notes for agents

- Environment: Debian 13 cloud desktop without root. Egress only via `browser-proxy:8889` (TLS
  interception, HTTP/WebSocket only; raw TCP/UDP, STUN/TURN and WebRTC media are blocked). Node trusts
  the proxy CA via `NODE_EXTRA_CA_CERTS` (set in `lib/common.sh`).
- `XDG_RUNTIME_DIR` (`/dev/shm/codex-orbit-desktop/runtime-*`) changes per session; never hard-code it.
  PulseAudio socket = `$XDG_RUNTIME_DIR/pulse/native` (override with `CLOUDCALL_PULSE_SOCKET`).
- Port 8081 is used by neko (remote desktop). Tunnel ports: 18481 (DHT proxy), 18482 (name server),
  3478 TCP+UDP (TURN).
- Never print or commit secrets: `private/` (call.env, cf-token) and `state/jami/` (account keys).
- Verify after changes: `sh -n` on shell scripts; `./install/apps.sh` (library check);
  `bin/start-audio && bin/audioctl list short sources`; `relay/deploy`; Jami online check with
  `JAMI_LOG_DHTNET=1 bin/jami -d -f /tmp/jami.log` then grep for `Buddy .* online` / `TCP negotiation`.
- Jami edits: `bin/jami-configure` rewrites account `config.yml` only while Jami is closed.
- Worker tunnel uses a single Durable Object (`idFromName('egress')`) so TURN sees one client IP
  (required for TURN-TCP `CONNECTION-BIND`).
- ntfy pushes are sent from the host browser, not the Worker (ntfy's per-IP quota is exhausted on
  Cloudflare egress IPs).
- Wire format of the browser relay: mono PCM16 16 kHz, 20 ms (640-byte) binary frames; JSON presence
  text frames.
- Killing processes: match on `/proc/<pid>/cmdline` and avoid `pkill -f` patterns that also match the
  invoking shell.
