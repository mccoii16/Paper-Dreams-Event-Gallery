import React, { useState } from 'react';
import { X, Download, Trash2, Calendar, FileText, HardDrive, User, AlertCircle } from 'lucide-react';
import { UploadItem } from '../types';
import { formatBytes } from '../utils/security';

interface MediaViewerModalProps {
  upload: UploadItem | null;
  onClose: () => void;
  onDelete: (upload: UploadItem) => Promise<void>;
  isDeleting: boolean;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  upload,
  onClose,
  onDelete,
  isDeleting,
}) => {
  const [hasError, setHasError] = useState(false);

  if (!upload) return null;

  const isLocalDevUrl = upload.downloadUrl?.startsWith('/uploads/');
  const showErrorCard = hasError || isLocalDevUrl;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = upload.downloadUrl;
    link.target = '_blank';
    link.download = upload.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const uploadDate = new Date(upload.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media Preview"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-[#1C1B1A] text-white rounded-2xl overflow-hidden shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#161514]">
          <div className="flex items-center space-x-3 overflow-hidden">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-[#9E7D46] text-white">
              {upload.mediaType}
            </span>
            <h4 className="text-sm font-medium truncate max-w-[240px] sm:max-w-md">
              {upload.safeDisplayName || upload.fileName}
            </h4>
          </div>

          <div className="flex items-center space-x-2">
            {!showErrorCard && (
              <button
                onClick={handleDownload}
                title="Download file"
                aria-label="Download media file"
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => onDelete(upload)}
              disabled={isDeleting}
              title="Delete from event"
              aria-label="Delete uploaded file"
              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close Preview"
              className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Media Canvas Body */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-black/50 min-h-[300px]">
          {showErrorCard ? (
            <div className="flex flex-col items-center justify-center p-8 text-center max-w-md bg-white/5 rounded-2xl border border-white/10 my-6">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h5 className="font-semibold text-base text-white mb-2">
                {isLocalDevUrl ? 'Local Dev Test File' : 'Media Preview Unavailable'}
              </h5>
              <p className="text-xs text-white/70 mb-5 leading-relaxed">
                This item was saved to local disk during a prior development session before Firebase Storage was connected. It does not exist on your live Vercel cloud deployment.
              </p>
              <button
                onClick={() => onDelete(upload)}
                disabled={isDeleting}
                className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Deleting record...' : 'Delete Legacy Record'}</span>
              </button>
            </div>
          ) : upload.mediaType === 'video' ? (
            <video
              src={upload.downloadUrl}
              controls
              autoPlay
              onError={() => setHasError(true)}
              className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-lg"
            />
          ) : (
            <img
              src={upload.downloadUrl}
              alt={upload.safeDisplayName}
              onError={() => setHasError(true)}
              className="max-h-[65vh] max-w-full rounded-lg object-contain shadow-lg"
            />
          )}
        </div>

        {/* Bottom Details Footer */}
        <div className="px-5 py-3.5 bg-[#161514] border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-white/70 gap-3">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="flex items-center space-x-1.5 text-[#F4E8D1] font-medium bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
              <User className="w-3.5 h-3.5 text-[#D8C7A5]" />
              <span>Shared by: <strong className="text-white">{upload.guestName || 'Anonymous Guest'}</strong></span>
            </span>
            <span className="flex items-center space-x-1 text-white/60">
              <Calendar className="w-3.5 h-3.5 text-[#9E7D46]" />
              <span>{uploadDate}</span>
            </span>
            <span className="flex items-center space-x-1 text-white/60">
              <HardDrive className="w-3.5 h-3.5 text-[#9E7D46]" />
              <span>{formatBytes(upload.fileSize)}</span>
            </span>
          </div>

          <div className="flex items-center space-x-1 text-white/50 text-[11px]">
            <FileText className="w-3.5 h-3.5 text-[#9E7D46]" />
            <span className="truncate max-w-[200px]">{upload.fileName}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
