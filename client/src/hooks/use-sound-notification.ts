import { useRef } from 'react';

export const NOTIFICATION_SOUNDS = [
  { id: 'cash',    label: '💰 Caisse',   url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { id: 'bell',    label: '🔔 Cloche',   url: 'https://assets.mixkit.co/active_storage/sfx/1/1-preview.mp3' },
  { id: 'chime',   label: '✨ Carillon', url: 'https://assets.mixkit.co/active_storage/sfx/2/2-preview.mp3' },
  { id: 'ding',    label: '🎵 Ding',     url: 'https://assets.mixkit.co/active_storage/sfx/3/3-preview.mp3' },
  { id: 'success', label: '✅ Succès',   url: 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3' },
];

export function useSoundNotification() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const soundEnabled = localStorage.getItem('notification_sound_enabled') !== 'false';
  const soundId = localStorage.getItem('notification_sound_id') || 'cash';
  const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId) || NOTIFICATION_SOUNDS[0];

  const playSound = () => {
    if (!soundEnabled) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      audioRef.current = new Audio(sound.url);
      audioRef.current.volume = 0.7;
      audioRef.current.play().catch(() => {});
    } catch {}
  };

  return { playSound, soundEnabled, soundId, sound };
}
