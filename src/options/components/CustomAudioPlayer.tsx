import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface CustomAudioPlayerProps {
  src: string;
  duration?: number;
}

const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, duration }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Atualiza duração quando a prop muda
  useEffect(() => {
    if (duration) {
      setAudioDuration(duration);
    }
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => {
      setCurrentTime(audio.currentTime);
    };

    const updateDuration = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      // Reseta para o início quando termina (comportamento WhatsApp)
      audio.currentTime = 0;
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('durationchange', updateDuration);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('durationchange', updateDuration);
    };
  }, []);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number): string => {
    if (!isFinite(time) || isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = audioDuration > 0 ? Math.min((currentTime / audioDuration) * 100, 100) : 0;

  return (
    <div className="custom-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="audio-player-container">
        <button
          type="button"
          className="play-button"
          onClick={togglePlayPause}
          aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>

        <div className="audio-waveform-container">
          <div className="audio-progress-track">
            <div
              className="audio-progress-fill"
              style={{ width: `${progress}%` }}
            >
              <div className="audio-progress-thumb" />
            </div>
          </div>
          <input
            type="range"
            min="0"
            max={audioDuration || 0}
            step="0.01"
            value={currentTime}
            onChange={handleSeek}
            className="audio-seek-slider"
            aria-label="Barra de progresso do áudio"
          />
        </div>

        <span className="audio-time">
          {formatTime(currentTime)}
        </span>
      </div>

      <style>{`
        .custom-audio-player {
          width: 100%;
        }

        .audio-player-container {
          display: flex;
          align-items: center;
          gap: 10px;
          background: rgba(233, 30, 99, 0.1);
          border-radius: 20px;
          padding: 8px 12px;
          border: 1px solid rgba(233, 30, 99, 0.2);
        }

        .play-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #e91e63;
          border: none;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .play-button:hover {
          background: #c2185b;
          transform: scale(1.05);
        }

        .play-button:active {
          transform: scale(0.95);
        }

        .audio-waveform-container {
          position: relative;
          flex: 1;
          height: 36px;
          display: flex;
          align-items: center;
        }

        .audio-progress-track {
          position: absolute;
          width: 100%;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          pointer-events: none;
        }

        .audio-progress-fill {
          position: relative;
          height: 100%;
          background: #e91e63;
          border-radius: 2px;
          transition: width 0.05s linear;
          min-width: 0;
        }

        .audio-progress-thumb {
          position: absolute;
          right: -6px;
          top: 50%;
          transform: translateY(-50%);
          width: 12px;
          height: 12px;
          background: #fff;
          border: 2px solid #e91e63;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .audio-seek-slider {
          position: relative;
          width: 100%;
          height: 36px;
          background: transparent;
          -webkit-appearance: none;
          appearance: none;
          cursor: pointer;
          z-index: 1;
        }

        .audio-seek-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: transparent;
          cursor: pointer;
        }

        .audio-seek-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: transparent;
          cursor: pointer;
          border: none;
        }

        .audio-time {
          font-size: 12px;
          color: var(--text-secondary);
          font-family: monospace;
          min-width: 40px;
          text-align: right;
          flex-shrink: 0;
        }

        .audio-seek-slider::-webkit-slider-runnable-track {
          background: transparent;
        }

        .audio-seek-slider::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export default CustomAudioPlayer;
