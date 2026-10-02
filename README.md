# CloudCall

Lets **Dot** (ChatGPT voice running in Google Chrome on a cloud PC) call the owner's iPhone.

This cloud PC reaches the internet through an HTTP proxy that supports HTTPS and WebSocket. Calling
apps normally connect directly over TCP/UDP, which isn't available here. CloudCall uses a Cloudflare
Worker on the owner's own Cloudflare account to provide two ways to call:

- **Jami call (rings a locked iPhone):** the Jami client on this PC connects to three Jami services
  through a WebSocket tunnel to the Worker, which opens the TCP connections:
  `dhtproxy.jami.net:443` (finding devices, push), `ns.jami.net:443` (usernames) and
  `turn.jami.net:3478` (call audio relay). The Worker accepts only these three destinations, and only
  with the secret key from `private/call.env`.
- **Browser call:** a web page on this PC and a page opened in Safari on the iPhone exchange audio
  through the Worker over WebSocket (the iPhone is notified via ntfy or a QR code).

Both run only between the owner's own devices and accounts.

Audio is routed with a private PulseAudio server:

| Device | Kind | Carries |
| --- | --- | --- |
| `dot_speaker` | sink | What Dot says (Chrome output) |
| `dot_voice` | source | `dot_speaker` monitor, used as the microphone of Jami / host page |
| `call_speaker` | sink | What the caller says (Jami / host page output) |
| `dot_mic` | source | `call_speaker` monitor, used as Dot's microphone |

## Restore after a cloud PC reset

```sh
git clone https://github.com/yujimtb/cloudcall ~/cloudcall
cd ~/cloudcall
./bootstrap.sh                 # downloads PulseAudio, Chrome, Jami into vendor/ (no root needed)
gh auth status || gh auth login
bin/restore-secrets            # pulls the encrypted bundle from the private repo; asks for the passphrase
```

Keep the kit in your home folder, not under `/workspace`: the cloud PC periodically deletes folders in
`/workspace` (only the desktop shortcuts written there survive), which removes `vendor/`, `state/` and
`private/` a few hours after installing. `bootstrap.sh` refuses to run from `/workspace`.

The Cloudflare Worker keeps running between resets, and the restored Jami account is the same device,
so nothing needs to change on the iPhone.

Then sign in to ChatGPT in **CloudCall Chrome (Dot)** once.

## Making a call

The owner (yujimtb) has asked Dot to call their iPhone with these steps:

1. Open **CloudCall Chrome (Dot)** (opens chatgpt.com).
2. Open **CloudCall Jami (Dot)**, select the contact `yujimtb` and press the audio call button.
   The iPhone rings even when locked.
3. Start ChatGPT voice mode after the call connects.
4. Hang up and quit Jami when done (the Jami tunnel uses Cloudflare Durable Object time while Jami runs).

Browser call instead: open **CloudCall Call iPhone (browser)**. It joins the call automatically,
sends the ntfy notification and shows a QR code; the iPhone answers in Safari and must stay unlocked.

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

To avoid typing the passphrase, put it in a file and set `CLOUDCALL_BACKUP_PASSFILE=/path/to/file`
for `bin/backup-secrets` / `bin/restore-secrets`.

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
