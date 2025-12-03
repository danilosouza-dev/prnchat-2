import React, { useState, useRef } from 'react';
import { FileText, X, Check } from 'lucide-react';

interface FileUploaderProps {
  onFileSelected: (blob: Blob, fileName: string) => void;
  currentFile?: Blob | null;
  currentFileName?: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelected, currentFile, currentFileName }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Accept common document formats
  const acceptedFormats = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv';

  const maxSize = 16 * 1024 * 1024; // 16MB max for files

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

    console.log('[FileUploader] File selected:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    setSelectedFile(file);
    onFileSelected(file, file.name);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📽️';
      case 'zip':
      case 'rar':
        return '📦';
      case 'txt':
        return '📃';
      default:
        return '📎';
    }
  };

  const discardFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayFile = currentFile || selectedFile;
  const displayFileName = currentFileName || selectedFile?.name || '';

  return (
    <div className="space-y-3">
      {error && <div className="error-message-sm">{error}</div>}

      <label htmlFor="file-upload" className="btn-record cursor-pointer inline-flex items-center justify-center gap-2">
        <FileText size={18} />
        Selecionar Arquivo
      </label>
      <input
        ref={fileInputRef}
        id="file-upload"
        type="file"
        accept={acceptedFormats}
        onChange={handleFileSelect}
        className="hidden"
      />

      {displayFile && displayFileName && (
        <div className="p-3 border border-[var(--border-color)] rounded-lg bg-[var(--bg-tertiary)] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-green-500">
              <Check size={16} />
              <span>Arquivo selecionado</span>
            </div>
            <button
              type="button"
              onClick={discardFile}
              className="text-red-500 hover:text-red-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-lg">{getFileIcon(displayFileName)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{displayFileName}</p>
              {selectedFile && (
                <p className="text-xs text-[var(--text-secondary)]">{formatFileSize(selectedFile.size)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Formatos: PDF, DOC, XLS, PPT, TXT, ZIP e mais | Máx: 16MB
      </p>
    </div>
  );
};

export default FileUploader;
