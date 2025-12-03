import React, { useState, useRef, useEffect } from 'react';
import { formatDuration } from '@/utils/helpers';
import { Mic, Square, Trash2, Check } from 'lucide-react';
import CustomAudioPlayer from './CustomAudioPlayer';

interface AudioRecorderProps {
  onAudioRecorded: (blob: Blob) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioRecorded }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      // Clean up audio URL on unmount
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [isRecording, audioUrl]);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Try to use audio/ogg with opus codec (WhatsApp PTT format)
      // If not supported, fallback to audio/webm
      let mimeType = 'audio/webm';
      const preferredTypes = [
        'audio/ogg; codecs=opus',
        'audio/ogg',
        'audio/webm; codecs=opus',
        'audio/webm'
      ];

      for (const type of preferredTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log('[AudioRecorder] Using MIME type:', type);
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Create blob with the correct MIME type
        const blob = new Blob(chunksRef.current, { type: mimeType });
        console.log('[AudioRecorder] Audio recorded:', {
          size: blob.size,
          type: blob.type,
          duration: recordingTime
        });

        // Revoke old URL if exists
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }

        // Create new URL for the audio blob
        const newUrl = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(newUrl);
        onAudioRecorded(blob);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      console.error('Error starting recording:', errorMessage, err);
      setError('Erro ao acessar microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const discardRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  };

  return (
    <div className="audio-recorder">
      {error && <div className="error-message-sm">{error}</div>}

      <div className="recorder-controls">
        {!isRecording && !audioBlob && (
          <button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wide transition-colors rounded-lg border border-[var(--border-color)] cursor-pointer px-5 py-2.5 text-[13px] bg-transparent text-white hover:bg-[var(--bg-hover)] hover:border-[var(--accent-pink)]"
            onClick={startRecording}
          >
            <Mic size={18} /> Gravar Áudio
          </button>
        )}

        {isRecording && (
          <div className="recording-state">
            <div className="recording-indicator">
              <span className="recording-dot"></span>
              Gravando... {formatDuration(recordingTime * 1000)}
            </div>
            <button
              type="button"
              className="btn-stop"
              onClick={stopRecording}
            >
              <Square size={18} /> Parar
            </button>
          </div>
        )}

        {audioBlob && !isRecording && audioUrl && (
          <div className="recording-preview">
            <div className="preview-header">
              <span><Check size={16} className="inline" /> Áudio gravado ({formatDuration(recordingTime * 1000)})</span>
              <button
                type="button"
                className="btn-discard"
                onClick={discardRecording}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <CustomAudioPlayer
              src={audioUrl}
              duration={recordingTime}
              key={audioUrl}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;
