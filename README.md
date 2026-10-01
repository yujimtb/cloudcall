# CloudCall

Lets **Dot** (ChatGPT voice running in Google Chrome on a locked-down cloud PC) call your iPhone.

The cloud PC can only reach the internet through a TLS-intercepting HTTP proxy that allows HTTPS and
WebSocket traffic only, so normal calling apps (WebRTC, UDP, TURN) do not work. CloudCall works around
that with a small Cloudflare Worker:

- **Jami call (rings a locked iPhone):** Jami on the cloud PC reaches the Jami network through a
  route-limited tunnel (WebSocket -> Worker -> TCP). Only `dhtproxy.jami.net:443`, `ns.jami.net:443`
  and `turn.jami.net:3478` are reachable through it, and only with the secret key.
- **Browser call (fallback):** the Worker relays audio between a host page on the cloud PC and a page
  you open in Safari (ntfy push notification or QR code).

Audio is routed with a private PulseAudio server:

| Device | Kind | Carries |
| --- | --- | --- |
| `dot_speaker` | sink | What Dot says (Chrome output) |
| `dot_voice` | source | `dot_speaker` monitor, used as the microphone of Jami / host page |
| `call_speaker` | sink | What the caller says (Jami / host page output) |
| `dot_mic` | source | `call_speaker` monitor, used as Dot's microphone |

## Restore after a cloud PC reset

```sh
git clone https://github.com/yujimtb/cloudcall /workspace/cloudcall
cd /workspace/cloudcall
./bootstrap.sh                 # downloads PulseAudio, Chrome, Jami into vendor/ (no root needed)
gh auth status || gh auth login
bin/restore-secrets            # pulls the encrypted bundle from the private repo; asks for the passphrase
```

The Cloudflare Worker keeps running between resets, and the restored Jami account is the same device,
so nothing needs to change on the iPhone.

Then sign in to ChatGPT in **CloudCall Chrome (Dot)** once.

## Making a call

1. Open **CloudCall Chrome (Dot)** (opens chatgpt.com).
2. Open **CloudCall Jami (Dot)** and call `yujimtb`. The iPhone rings even when locked.
3. Start ChatGPT voice mode after the call connects.
4. Quit Jami when done (the tunnel uses Cloudflare Durable Object time while Jami runs).

Fallback: **CloudCall Call iPhone (browser)** rings the iPhone through ntfy and shows a QR code; the
iPhone joins in Safari (must stay unlocked during the call).

## Saving secrets

Secrets never go into this public repo. After changing anything in `private/` or the Jami account, run
this in a terminal (it asks for a passphrase):

```sh
bin/backup-secrets
```

It encrypts `private/` (relay URL, room, ntfy topic, tunnel secret, Cloudflare token) and the Jami
account data with AES-256 (PBKDF2, 600k iterations) and pushes it to the private repo
`yujimitobe/cloudcall-secrets` (override with `CLOUDCALL_SECRETS_REPO`). The GitHub account you log in
with via `gh auth login` needs access to it.

## Starting from scratch (no backup)

1. Create a Cloudflare API token with the **Edit Cloudflare Workers** template (free plan is fine; open
   *Workers & Pages* once so the account has a `workers.dev` subdomain) and save it to `private/cf-token`.
2. `relay/deploy` (creates `private/call.env` with new secrets and deploys the Worker).
3. Open **CloudCall Jami (Dot)**, import or create the Dot account, quit Jami, open it again
   (settings are applied on every launch by `bin/jami-configure`).
4. iPhone: install Jami (linked to the account Dot calls) and ntfy subscribed to `NTFY_TOPIC` from
   `private/call.env`.
5. `bin/backup-secrets`.

## Layout

```
bootstrap.sh          one-shot setup (re-runnable)
install/apps.sh       downloads + extracts .deb packages into vendor/, checks shared libraries
bin/                  launchers and tools (start-audio, chrome, jami, call-iphone, route-dot, ...)
relay/                Cloudflare Worker (src/), web pages (public/), deploy script, jami-tunnel.cjs
templates/dring.yml   Jami global settings (PulseAudio backend)
vendor/ state/ private/   created locally, git-ignored
```
