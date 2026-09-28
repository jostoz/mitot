let context: AudioContext | undefined;

function audioContext() {
  context ??= new AudioContext();
  return context;
}

/** Debe llamarse desde un gesto del usuario para cumplir la política de autoplay del navegador. */
export function unlockNotificationSound() {
  return audioContext().resume().catch(() => undefined);
}

/** Campanilla corta para una notificación entrante. No descarga ni mantiene un asset de audio. */
export async function playNotificationSound() {
  const audio = audioContext();
  if (audio.state === "suspended") await audio.resume();
  if (audio.state !== "running") return;

  const start = audio.currentTime;
  for (const [offset, frequency] of [[0, 880], [0.12, 1320]] as const) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start + offset);
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.11, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.17);
  }
}
