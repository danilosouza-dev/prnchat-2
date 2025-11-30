import React, { useState, useRef, useEffect } from 'react';
import { formatDuration } from '@/utils/helpers';

interface AudioRecorderProps {
  onAudioRecorded: (blob: Blob) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioRecorded }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
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
    };
  }, [isRecording]);

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
        setAudioBlob(blob);
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
    setAudioBlob(null);
    setRecordingTime(0);
  };

  return (
    <div className="audio-recorder">
      {error && <div className="error-message-sm">{error}</div>}

      <div className="recorder-controls">
        {!isRecording && !audioBlob && (
          <button
            type="button"
            className="btn-record"
            onClick={startRecording}
          >
            🎤 Gravar Áudio
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
              ⏹️ Parar
            </button>
          </div>
        )}

        {audioBlob && !isRecording && (
          <div className="recording-preview">
            <div className="preview-header">
              <span>✅ Áudio gravado ({formatDuration(recordingTime * 1000)})</span>
              <button
                type="button"
                className="btn-discard"
                onClick={discardRecording}
              >
                🗑️
              </button>
            </div>
            <audio
              controls
              src={URL.createObjectURL(audioBlob)}
              className="audio-player"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;
