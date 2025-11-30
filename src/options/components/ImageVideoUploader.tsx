import React, { useState, useRef } from 'react';

interface ImageVideoUploaderProps {
  type: 'image' | 'video';
  onFileSelected: (blob: Blob) => void;
}

const ImageVideoUploader: React.FC<ImageVideoUploaderProps> = ({ type, onFileSelected }) => {
  const [selectedFile, setSelectedFile] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptedFormats = type === 'image'
    ? 'image/jpeg,image/png,image/gif,image/webp'
    : 'video/mp4,video/webm,video/ogg';

  const maxSize = type === 'image' ? 5 * 1024 * 1024 : 16 * 1024 * 1024; // 5MB for images, 16MB for videos

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    // Validate file size
    if (file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      setError(`Arquivo muito grande. Tamanho máximo: ${maxSizeMB}MB`);
      return;
    }

    // Validate file type
    if (type === 'image' && !file.type.startsWith('image/')) {
      setError('Formato inválido. Use JPEG, PNG, GIF ou WebP.');
      return;
    }

    if (type === 'video' && !file.type.startsWith('video/')) {
      setError('Formato inválido. Use MP4, WebM ou OGG.');
      return;
    }

    console.log(`[${type}Uploader] File selected:`, {
      name: file.name,
      size: file.size,
      type: file.type
    });

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const discardFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="image-video-uploader">
      {error && <div className="error-message-sm">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      <div className="uploader-controls">
        {!selectedFile && (
          <button
            type="button"
            className="btn-upload"
            onClick={handleClick}
          >
            {type === 'image' ? '🖼️ Selecionar Imagem' : '🎥 Selecionar Vídeo'}
          </button>
        )}

        {selectedFile && (
          <div className="file-preview">
            <div className="preview-header">
              <span>
                ✅ {type === 'image' ? 'Imagem' : 'Vídeo'} selecionado(a) ({formatFileSize(selectedFile.size)})
              </span>
              <button
                type="button"
                className="btn-discard"
                onClick={discardFile}
              >
                🗑️
              </button>
            </div>

            {type === 'image' && previewUrl && (
              <div className="image-preview-container">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="image-preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '8px',
                    marginTop: '10px'
                  }}
                />
              </div>
            )}

            {type === 'video' && previewUrl && (
              <div className="video-preview-container">
                <video
                  controls
                  src={previewUrl}
                  className="video-preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '300px',
                    borderRadius: '8px',
                    marginTop: '10px'
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="uploader-hint">
        <small>
          {type === 'image'
            ? 'Formatos: JPEG, PNG, GIF, WebP | Máx: 5MB'
            : 'Formatos: MP4, WebM, OGG | Máx: 16MB'}
        </small>
      </div>
    </div>
  );
};

export default ImageVideoUploader;
