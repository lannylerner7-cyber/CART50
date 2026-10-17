import { useCallback, useEffect, useRef, useState } from 'react';

/** One generated 15-second clip, looped while the login screen is visible. */
export function useCoinAudio() {
  const player = useRef<HTMLAudioElement | null>(null);
  const wanted = useRef(true);
  const attempt = useRef(0);
  const [sound, setSound] = useState(false);
  const [audioErr, setAudioErr] = useState<string | null>(null);

  const play = useCallback(async () => {
    const audio = player.current;
    if (!audio || document.hidden || !wanted.current) return;
    const id = ++attempt.current;
    try {
      await audio.play();
      if (id !== attempt.current || player.current !== audio) return;
      if (!wanted.current || document.hidden) { audio.pause(); return; }
      setSound(true);
      setAudioErr(null);
    } catch (error) {
      if (id !== attempt.current || player.current !== audio) return;
      setSound(false);
      setAudioErr(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Autoplay is blocked. Tap Coin rain sound to listen.'
        : 'Coin audio could not play. Tap the sound button to retry.');
    }
  }, []);

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/coin-rain-15s.mp3`);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0.35;
    player.current = audio;
    const onError = () => {
      setSound(false);
      setAudioErr('Coin audio could not load. Tap the sound button to retry.');
    };
    const onVisibility = () => {
      if (document.hidden) {
        ++attempt.current;
        audio.pause();
        setSound(false);
      } else if (wanted.current) void play();
    };
    audio.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    void play();
    return () => {
      ++attempt.current;
      player.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, [play]);

  const toggleSound = () => {
    const audio = player.current;
    if (!audio) return;
    setAudioErr(null);
    if (!audio.paused) {
      wanted.current = false;
      ++attempt.current;
      audio.pause();
      setSound(false);
    } else {
      wanted.current = true;
      if (audio.error) audio.load();
      // Called directly from the tap, for Safari/iPad playback permission.
      void play();
    }
  };
  return { sound, audioErr, toggleSound };
}
