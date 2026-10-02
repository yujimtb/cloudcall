# Notes for agents

- Purpose: lets Dot (ChatGPT voice) call the owner's own iPhone. All accounts (Cloudflare, Jami,
  GitHub, ntfy) belong to the owner, yujimtb.
- Environment: Debian 13 cloud desktop without root. Outbound access is through the HTTP proxy
  `browser-proxy:8889` (HTTPS and WebSocket, with TLS inspection; Node trusts its CA via
  `NODE_EXTRA_CA_CERTS`, set in `lib/common.sh`). Direct TCP/UDP connections, and therefore WebRTC
  media, aren't available, which is why Jami's connections go through the Worker tunnel (`relay/`).
- Jami tunnel: `relay/jami-tunnel.cjs` listens on 127.0.0.1 and forwards over WebSocket to the Worker
  route `/tunnel/<TUNNEL_SECRET>/<host:port>`, which accepts only `dhtproxy.jami.net:443`,
  `ns.jami.net:443` and `turn.jami.net:3478`. Local ports: 18481 (DHT proxy), 18482 (name server),
  3478 TCP+UDP (TURN). Port 8081 is used by neko (remote desktop).
- The Worker tunnel uses a single Durable Object (`idFromName('egress')`) so the TURN server sees one
  client IP (required for TURN-over-TCP `CONNECTION-BIND`).
- Install location: `~/cloudcall`. Never under `/workspace`; the cloud PC's scratch cleaner renames
  folders there to `/workspace/.scratch-cleaning-*` and deletes them every few hours, while the running
  Jami/Chrome/PulseAudio/tunnel processes keep going from deleted files. Desktop shortcuts
  (`*.desktop` files) in `/workspace` are fine.
- `XDG_RUNTIME_DIR` (`/dev/shm/codex-orbit-desktop/runtime-*`) changes per session; never hard-code it.
  PulseAudio socket = `$XDG_RUNTIME_DIR/pulse/native` (override with `CLOUDCALL_PULSE_SOCKET`).
- Never print or commit secrets: `private/` (call.env, cf-token, backup passphrase) and `state/jami/`
  (account keys).
- Verify after changes: `sh -n` on shell scripts; `./install/apps.sh` (library check);
  `bin/start-audio && bin/audioctl list short sources`; `relay/deploy`; Jami online check with
  `JAMI_LOG_DHTNET=1 bin/jami -d -f /tmp/jami.log`, then grep for `Buddy .* online` / `TCP negotiation`.
- Jami edits: `bin/jami-configure` rewrites account `config.yml` only while Jami is closed.
- ntfy notifications are sent from the host page in the browser, not the Worker (ntfy's per-IP quota
  is used up on Cloudflare's shared IPs).
- Browser relay wire format: mono PCM16 16 kHz, 20 ms (640-byte) binary frames; JSON presence text
  frames.
- Stopping processes: match on `/proc/<pid>/cmdline`; avoid `pkill -f` patterns that also match the
  invoking shell.
