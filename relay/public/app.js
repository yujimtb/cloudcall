import { startCall } from './audio.js';
import qrcode from './vendor/qrcode.mjs';

const role = document.body.dataset.role;
const params = new URLSearchParams(location.hash.slice(1));
const room = params.get('room');
const $ = (id) => document.getElementById(id);
const status = $('status');
const button = $('call');
let call = null;
let wakeLock = null;
let rang = false;

const constraints = role === 'host'
  ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }
  : { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };

const setStatus = (text, state) => {
  status.textContent = text;
  document.body.dataset.state = state;
};

const ring = async () => {
  const topic = params.get('ntfy');
  if (!topic) return ($('ring-result').textContent = 'No ntfy topic in this link.');
  const body = JSON.stringify({
    topic,
    title: 'Incoming call',
    message: 'Tap to answer',
    priority: 5,
    tags: ['telephone_receiver'],
    click: `${location.origin}/#room=${room}`,
  });
  const response = await fetch('https://ntfy.sh/', { method: 'POST', body }).catch((error) => ({ ok: false, text: () => error.message }));
  $('ring-result').textContent = response.ok ? 'Notification sent.' : `Ring failed: ${await response.text()}`;
};

const onStatus = ({ connected, peer, connecting, replaced }) => {
  const other = role === 'host' ? 'iPhone' : 'computer';
  if (replaced) return setStatus('This call was opened somewhere else.', 'idle');
  if (connecting || !connected) return setStatus('Connecting...', 'waiting');
  if (!peer) {
    if (role === 'host' && params.get('ring') === '1' && !rang) {
      rang = true;
      ring();
    }
    return setStatus(`Connected. Waiting for the ${other}...`, 'waiting');
  }
  setStatus(`In call with the ${other}`, 'live');
};

const onLevels = ({ mic, remote }) => {
  $('mic-level').style.width = `${Math.min(100, mic * 140)}%`;
  $('remote-level').style.width = `${Math.min(100, remote * 140)}%`;
};

async function start() {
  const context = new AudioContext();
  button.disabled = true;
  try {
    call = await startCall({ role, room, context, constraints, onStatus, onLevels });
    button.textContent = 'Hang up';
    button.classList.add('end');
    wakeLock = await navigator.wakeLock?.request('screen').catch(() => null);
  } catch (error) {
    context.close();
    setStatus(`Could not start: ${error.message}`, 'idle');
  }
  button.disabled = false;
}

function stop() {
  call?.stop();
  call = null;
  wakeLock?.release();
  button.textContent = role === 'host' ? 'Start call' : 'Answer';
  button.classList.remove('end');
  setStatus('Call ended.', 'idle');
}

if (!room) {
  setStatus('This link is missing its room code.', 'idle');
  button.disabled = true;
} else {
  button.onclick = () => (call ? stop() : start());
  if (role === 'host') {
    const phoneUrl = `${location.origin}/#room=${room}`;
    $('phone-link').href = phoneUrl;
    $('phone-link').textContent = phoneUrl;
    const qr = qrcode(0, 'M');
    qr.addData(phoneUrl);
    qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 20, scalable: true });
    $('ring').onclick = ring;
    if (params.get('auto') === '1') start();
  }
}
