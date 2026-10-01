const peak = (buffer) => {
  const samples = new Int16Array(buffer);
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  return max / 0x8000;
};

export async function startCall({ role, room, context, constraints, onStatus, onLevels }) {
  await context.audioWorklet.addModule('/worklet.js');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  const capture = new AudioWorkletNode(context, 'capture', { outputChannelCount: [1] });
  const silent = context.createGain();
  silent.gain.value = 0;
  context.createMediaStreamSource(stream).connect(capture).connect(silent).connect(context.destination);
  const player = new AudioWorkletNode(context, 'player', { numberOfInputs: 0, outputChannelCount: [2] });
  player.connect(context.destination);

  const peer = role === 'host' ? 'phone' : 'host';
  const levels = { mic: 0, remote: 0 };
  let socket;
  let retry;
  let stopped = false;

  const connect = () => {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}/ws/${room}?role=${role}`);
    socket.binaryType = 'arraybuffer';
    onStatus({ connected: false, peer: false, connecting: true });
    socket.onopen = () => onStatus({ connected: true, peer: false });
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);
        if (message.type === 'presence') onStatus({ connected: true, peer: message[peer] });
        return;
      }
      levels.remote = Math.max(levels.remote, peak(event.data));
      player.port.postMessage(event.data, [event.data]);
    };
    socket.onclose = (event) => {
      if (stopped) return;
      onStatus({ connected: false, peer: false, replaced: event.code === 4000 });
      if (event.code !== 4000) retry = setTimeout(connect, 1500);
    };
  };

  capture.port.onmessage = (event) => {
    levels.mic = Math.max(levels.mic, peak(event.data));
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 64000) socket.send(event.data);
  };

  const meter = setInterval(() => {
    onLevels?.({ ...levels });
    levels.mic = 0;
    levels.remote = 0;
  }, 100);
  const resume = () => context.state !== 'running' && context.resume();
  document.addEventListener('visibilitychange', resume);
  connect();

  return {
    stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(meter);
      document.removeEventListener('visibilitychange', resume);
      socket?.close(1000);
      stream.getTracks().forEach((track) => track.stop());
      context.close();
    },
  };
}
