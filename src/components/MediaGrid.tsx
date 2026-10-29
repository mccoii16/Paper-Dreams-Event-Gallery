import React from 'react';
import { Play, Download, Trash2, Image as ImageIcon, Video as VideoIcon, User } from 'lucide-react';
import { UploadItem } from '../types';
import { formatBytes } from '../utils/security';

interface MediaGridProps {
  uploads: UploadItem[];
  onSelect: (upload: UploadItem) => void;
  onDelete: (upload: UploadItem) => void;
  filter: 'all' | 'image' | 'video';
}

export const MediaGrid: React.FC<MediaGridProps> = ({
  uploads,
  onSelect,
  onDelete,
  filter,
}) => {
  const filtered = uploads.filter((item) => {
    if (filter === 'all') return true;
    return item.mediaType === filter;
  });

  if (filtered.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E8E3D8] p-12 text-center my-6">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#FAF9F5] border border-[#E2DDD3] flex items-center justify-center text-[#9E7D46]">
          {filter === 'video' ? <VideoIcon className="w-6 h-6" /> : <ImageIcon className="w-6 h-6" />}
        </div>
        <h4 className="text-base font-serif font-bold text-[#1C1B1A] mb-1">
          {filter === 'all'
            ? 'No memories uploaded yet'
            : `No ${filter === 'image' ? 'photos' : 'videos'} uploaded`}
        </h4>
        <p className="text-xs text-[#7A7875] max-w-sm mx-auto">
          Share your guest QR code or link with attendees. As soon as guests drop their photos and videos, they will appear here in real-time.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 my-6">
      {filtered.map((item) => {
        const timeAgo = new Date(item.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className="group relative aspect-square rounded-xl overflow-hidden bg-[#EFECE6] border border-[#E5E0D5] cursor-pointer shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5"
          >
            {item.mediaType === 'video' ? (
              <div className="relative w-full h-full bg-black/80 flex items-center justify-center">
                <video
                  src={item.downloadUrl}
                  className="w-full h-full object-cover opacity-85"
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                  <div className="w-10 h-10 rounded-full bg-white/90 text-[#1C1B1A] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                  </div>
                </div>
              </div>
            ) : (
              <img
                src={item.downloadUrl}
                alt={item.safeDisplayName}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}

            {/* Top Badge: Type */}
            <div className="absolute top-2 left-2 z-10 flex items-center space-x-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] font-medium text-white/90">
              {item.mediaType === 'video' ? (
                <>
                  <VideoIcon className="w-2.5 h-2.5" />
                  <span>Video</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-2.5 h-2.5" />
                  <span>Photo</span>
                </>
              )}
            </div>

            {/* Top Right Badge: Contributor Name */}
            {item.guestName && (
              <div
                title={`Shared by ${item.guestName}`}
                className="absolute top-2 right-2 z-10 flex items-center space-x-1 max-w-[110px] px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-xs text-[10px] font-medium text-[#F4E8D1] border border-white/10"
              >
                <User className="w-2.5 h-2.5 text-[#D8C7A5] shrink-0" />
                <span className="truncate">{item.guestName}</span>
              </div>
            )}

            {/* Hover Bottom Overlay with actions */}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <div className="text-[10px] text-white/90 truncate mr-1">
                <div className="font-semibold truncate">{item.safeDisplayName}</div>
                <div className="text-[#D8C7A5] font-medium truncate flex items-center space-x-1 my-0.5">
                  <User className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{item.guestName || 'Anonymous Guest'}</span>
                </div>
                <div className="text-white/60 text-[9px]">{formatBytes(item.fileSize)} • {timeAgo}</div>
              </div>

              <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <a
                  href={item.downloadUrl}
                  download={item.fileName}
                  target="_blank"
                  rel="noreferrer"
                  title="Download"
                  className="p-1 rounded bg-white/20 hover:bg-white text-white hover:text-[#1C1B1A] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => onDelete(item)}
                  title="Delete"
                  aria-label="Delete media item"
                  className="p-1 rounded bg-white/20 hover:bg-red-600 text-white transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
