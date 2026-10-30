import React, { useEffect, useState, useRef } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Calendar,
  MapPin,
  Sparkles,
  RefreshCw,
  Lock,
  RotateCcw,
  User,
} from 'lucide-react';
import { EventItem, QueuedUploadFile } from '../types';
import { getEventByToken, uploadGuestMedia } from '../services/eventService';
import {
  formatBytes,
  validateFileSelection,
  generateUnguessableToken,
} from '../utils/security';

interface GuestEventPageProps {
  publicToken: string;
}

export const GuestEventPage: React.FC<GuestEventPageProps> = ({ publicToken }) => {
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<QueuedUploadFile[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Guest identity attribution
  const [guestName, setGuestName] = useState<string>(() => {
    return sessionStorage.getItem('paperdreams_guest_name') || '';
  });

  const handleGuestNameChange = (val: string) => {
    setGuestName(val);
    sessionStorage.setItem('paperdreams_guest_name', val);
  };

  // Hidden native file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const videosInputRef = useRef<HTMLInputElement>(null);

  // Cancel ref
  const cancelRequestedRef = useRef<boolean>(false);

  // Anonymous guest session token (transient)
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    let sess = sessionStorage.getItem('fotoshare_guest_session');
    if (!sess) {
      sess = `guest_${generateUnguessableToken(16)}`;
      sessionStorage.setItem('fotoshare_guest_session', sess);
    }
    sessionIdRef.current = sess;

    const loadEvent = async () => {
      try {
        setLoading(true);
        if (publicToken === 'demo') {
          setEvent({
            id: 'demo-event-1',
            name: "Alexandra & Julian's Sunset Gala",
            description: "Welcome to our wedding celebration! Please drop all your candid shots, dance-floor clips, and table selfies here so we can cherish them forever.",
            date: "October 18, 2026",
            location: "Napa Valley, California",
            bannerUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=80",
            publicToken: 'demo',
            organizerIds: [],
            status: 'active',
            maxFilesPerGuest: 100,
            maxFileSizeMb: 50,
            allowedTypes: ['image', 'video'],
            uploadsCount: 14,
            createdBy: 'demo',
            createdAt: new Date().toISOString(),
          });
          setLoading(false);
          return;
        }

        const ev = await getEventByToken(publicToken);
        if (!ev || ev.status !== 'active') {
          setNotFound(true);
        } else {
          setEvent(ev);
        }
      } catch (e) {
        console.warn('Could not load public event:', e);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    if (publicToken) {
      loadEvent();
    }
  }, [publicToken]);

  const handleFilesAdded = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !event) return;
    setValidationError(null);

    const incoming = Array.from(e.target.files);
    e.target.value = '';

    const newQueued: QueuedUploadFile[] = [];
    let currentCount = selectedFiles.length;

    for (const file of incoming) {
      if (currentCount >= event.maxFilesPerGuest) {
        setValidationError(
          `Selection limit reached (${event.maxFilesPerGuest} files maximum). Some items were not added.`
        );
        break;
      }

      const validation = validateFileSelection(file, event.maxFileSizeMb, event.allowedTypes);
      if (!validation.valid) {
        setValidationError(validation.error || 'One or more files did not meet upload requirements.');
        continue;
      }

      const isVideo = file.type.startsWith('video/');
      const previewUrl = URL.createObjectURL(file);

      newQueued.push({
        id: generateUnguessableToken(12),
        file,
        previewUrl,
        mediaType: isVideo ? 'video' : 'image',
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        status: 'idle',
      });
      currentCount++;
    }

    if (newQueued.length > 0) {
      setSelectedFiles((prev) => [...prev, ...newQueued]);
    }
  };

  const handleRemoveFile = (id: string) => {
    setSelectedFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleClearAll = () => {
    selectedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setSelectedFiles([]);
    setValidationError(null);
  };

  const handleStartUpload = async () => {
    if (!event || selectedFiles.length === 0 || isUploading) return;
    setIsUploading(true);
    setValidationError(null);
    cancelRequestedRef.current = false;

    const updated = [...selectedFiles];

    for (let i = 0; i < updated.length; i++) {
      if (cancelRequestedRef.current) break;

      const item = updated[i];
      if (item.status === 'success') continue;

      item.status = 'uploading';
      setSelectedFiles([...updated]);

      try {
        await uploadGuestMedia({
          eventId: event.id,
          publicToken: event.publicToken,
          file: item.file,
          uploaderSessionId: sessionIdRef.current,
          guestName: guestName.trim() || 'Anonymous Guest',
          onProgress: (percent) => {
            item.progress = percent;
            setSelectedFiles([...updated]);
          },
        });
        item.status = 'success';
        item.progress = 100;
        setSelectedFiles([...updated]);
      } catch (err: unknown) {
        item.status = 'error';
        item.errorMessage = err instanceof Error ? err.message : 'Upload failed';
        setSelectedFiles([...updated]);
      }
    }

    setIsUploading(false);
    const hasFailures = updated.some((f) => f.status === 'error');
    if (!hasFailures && !cancelRequestedRef.current) {
      setUploadComplete(true);
    }
  };

  const handleRetryItem = async (id: string) => {
    if (!event || isUploading) return;
    const target = selectedFiles.find((f) => f.id === id);
    if (!target) return;

    setIsUploading(true);
    target.status = 'uploading';
    target.errorMessage = undefined;
    setSelectedFiles([...selectedFiles]);

    try {
      await uploadGuestMedia({
        eventId: event.id,
        publicToken: event.publicToken,
        file: target.file,
        uploaderSessionId: sessionIdRef.current,
        guestName: guestName.trim() || 'Anonymous Guest',
        onProgress: (pct) => {
          target.progress = pct;
          setSelectedFiles([...selectedFiles]);
        },
      });
      target.status = 'success';
      target.progress = 100;
    } catch (e: unknown) {
      target.status = 'error';
      target.errorMessage = e instanceof Error ? e.message : 'Retry failed';
    } finally {
      setIsUploading(false);
      setSelectedFiles([...selectedFiles]);
      if (selectedFiles.every((f) => f.status === 'success')) {
        setUploadComplete(true);
      }
    }
  };

  const handleCancelUpload = () => {
    cancelRequestedRef.current = true;
    setIsUploading(false);
  };

  const handleUploadMore = () => {
    handleClearAll();
    setUploadComplete(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-2 border-[#9E7D46] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-serif text-[#6E6D6B]">Loading celebration...</p>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#E8E3D8] p-6 sm:p-8 text-center shadow-lg">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[#F5F2EA] flex items-center justify-center text-[#7A7875]">
            <Lock className="w-6 h-6 text-[#9E7D46]" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1C1B1A] mb-2">
            Event Unavailable
          </h2>
          <p className="text-xs sm:text-sm text-[#7A7875] leading-relaxed mb-6">
            This event link is either expired, unavailable, or uploads have been temporarily closed by the hosts.
          </p>
          <div className="text-[11px] text-[#A3A09A]">
            Please check with your event host for an updated invitation or QR code.
          </div>
        </div>
      </div>
    );
  }

  const totalBytesSelected = selectedFiles.reduce((acc, f) => acc + f.fileSize, 0);
  const allSucceeded = selectedFiles.length > 0 && selectedFiles.every((f) => f.status === 'success');
  const successCount = selectedFiles.filter((f) => f.status === 'success').length;
  const hasSelected = selectedFiles.length > 0;

  return (
    <div className={`min-h-screen bg-[#FAF9F5] text-[#1C1B1A] flex flex-col items-center ${hasSelected && !uploadComplete ? 'pb-28 sm:pb-16' : 'pb-16'}`}>
      {/* Hidden Native File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFilesAdded}
        className="hidden"
      />
      <input
        ref={photosInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilesAdded}
        className="hidden"
      />
      <input
        ref={videosInputRef}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFilesAdded}
        className="hidden"
      />

      {/* Main Container */}
      <div className="w-full max-w-xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-6">
        {/* Event Card with Cover Banner */}
        <div className="bg-white rounded-3xl overflow-hidden border border-[#E8E3D8] shadow-xs mb-5">
          <div className="relative h-44 sm:h-64 w-full bg-[#E5E0D5]">
            <img
              src={event.bannerUrl}
              alt={event.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

            <div className="absolute bottom-4 left-4 right-4 sm:bottom-5 sm:left-5 sm:right-5 text-white">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md mb-1.5 inline-block">
                Guest Media Drop
              </span>
              <h1 className="text-xl sm:text-3xl font-serif font-bold tracking-tight leading-tight">
                {event.name}
              </h1>

              <div className="flex flex-wrap items-center gap-2.5 text-xs text-white/80 mt-1.5">
                {event.date && (
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-[#D8C7A5]" />
                    <span>{event.date}</span>
                  </span>
                )}
                {event.location && (
                  <span className="flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-[#D8C7A5]" />
                    <span className="truncate">{event.location}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Host Welcome Note */}
          <div className="p-4 sm:p-6 bg-[#FAF9F5]/70 border-t border-[#EAE5D8]">
            <p className="text-xs sm:text-sm text-[#5D5B57] leading-relaxed">
              {event.description ||
                'Welcome! Drop your candid photos and videos from today so the hosts can keep every memory safe. No account or download needed.'}
            </p>
          </div>
        </div>

        {/* Success View */}
        {uploadComplete && allSucceeded ? (
          <div className="bg-white rounded-3xl border border-[#E8E3D8] p-6 sm:p-8 text-center shadow-md animate-fade-in my-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#1C1B1A] mb-1">
              {guestName.trim() ? `Thank You, ${guestName.trim()}!` : 'Memories Received!'}
            </h2>
            <p className="text-xs sm:text-sm text-[#6E6D6B] max-w-sm mx-auto mb-6">
              Thank you for contributing {successCount} {successCount === 1 ? 'memory' : 'memories'} to {event.name}. The hosts are excited to look through your photos and videos!
            </p>

            <button
              onClick={handleUploadMore}
              className="inline-flex items-center space-x-2 py-3 px-6 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-[#D8C7A5]" />
              <span>Share More Photos or Videos</span>
            </button>
          </div>
        ) : (
          <>
            {/* Contributor Identity Card */}
            <div className="bg-white rounded-3xl border border-[#E8E3D8] p-4 sm:p-5 shadow-xs mb-4">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="guest-name-input" className="text-xs font-semibold text-[#1C1B1A] flex items-center space-x-1.5 cursor-pointer">
                  <User className="w-3.5 h-3.5 text-[#9E7D46]" />
                  <span>Your Name or Family Name</span>
                </label>
                <span className="text-[10px] text-[#9E7D46] font-medium bg-[#FAF6EC] px-2 py-0.5 rounded-full border border-[#EADBBD]">
                  Shared with hosts
                </span>
              </div>
              <div className="relative">
                <input
                  id="guest-name-input"
                  type="text"
                  value={guestName}
                  onChange={(e) => handleGuestNameChange(e.target.value)}
                  placeholder="e.g. Sarah Miller or The Tan Family"
                  maxLength={60}
                  disabled={isUploading}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-[#DDD7CB] focus:border-[#9E7D46] focus:ring-1 focus:ring-[#9E7D46] text-xs bg-[#FAF9F5] text-[#1C1B1A] outline-none transition-all placeholder:text-[#A3A09A]"
                />
                {guestName && !isUploading && (
                  <button
                    type="button"
                    onClick={() => handleGuestNameChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A3A09A] hover:text-[#1C1B1A] p-1"
                    title="Clear name"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[10px] text-[#8C8983] mt-1.5">
                {guestName.trim()
                  ? `Your uploads will be credited to "${guestName.trim()}".`
                  : 'Enter your name so the organizers know who gave each photo & video.'}
              </p>
            </div>

            {/* Selection Action Buttons */}
            <div className="bg-white rounded-3xl border border-[#E8E3D8] p-4 sm:p-6 shadow-xs mb-5">
              <h3 className="text-sm font-serif font-bold text-[#1C1B1A] mb-1">
                Add Photos & Videos
              </h3>
              <p className="text-xs text-[#7A7875] mb-4">
                Select from your device or capture a live shot right now.
              </p>

              {/* Responsive 3-action buttons (safe on 320px, 360px, 390px, 430px) */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {/* Take Photo Native Camera */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDD7CB] hover:bg-[#F2EEE4] hover:border-[#1C1B1A] transition-all group disabled:opacity-50 cursor-pointer text-center"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white border border-[#E5E0D5] flex items-center justify-center text-[#1C1B1A] mb-1.5 group-hover:scale-110 transition-transform shadow-2xs">
                    <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-[#9E7D46]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-semibold text-[#1C1B1A] leading-tight truncate w-full">
                    Take Photo
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-[#8C8983] mt-0.5">
                    Camera
                  </span>
                </button>

                {/* Choose Photos Library */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => photosInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDD7CB] hover:bg-[#F2EEE4] hover:border-[#1C1B1A] transition-all group disabled:opacity-50 cursor-pointer text-center"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white border border-[#E5E0D5] flex items-center justify-center text-[#1C1B1A] mb-1.5 group-hover:scale-110 transition-transform shadow-2xs">
                    <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-[#9E7D46]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-semibold text-[#1C1B1A] leading-tight truncate w-full">
                    Photos
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-[#8C8983] mt-0.5">
                    Gallery
                  </span>
                </button>

                {/* Choose Videos Library */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => videosInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-2xl bg-[#FAF9F5] border border-[#DDD7CB] hover:bg-[#F2EEE4] hover:border-[#1C1B1A] transition-all group disabled:opacity-50 cursor-pointer text-center"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white border border-[#E5E0D5] flex items-center justify-center text-[#1C1B1A] mb-1.5 group-hover:scale-110 transition-transform shadow-2xs">
                    <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5 text-[#9E7D46]" />
                  </div>
                  <span className="text-[11px] sm:text-xs font-semibold text-[#1C1B1A] leading-tight truncate w-full">
                    Videos
                  </span>
                  <span className="text-[9px] sm:text-[10px] text-[#8C8983] mt-0.5">
                    Clips
                  </span>
                </button>
              </div>

              <div className="mt-3.5 pt-2.5 border-t border-[#F0EBE0] flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] text-[#8C8983] gap-1">
                <span>
                  Limit: {event.maxFilesPerGuest} files • Max {event.maxFileSizeMb}MB each
                </span>
                <span>Original Quality</span>
              </div>
            </div>

            {/* Validation Notice */}
            {validationError && (
              <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start space-x-2 text-xs text-amber-800 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Pre-Upload Staging Tray */}
            {hasSelected && (
              <div className="bg-white rounded-3xl border border-[#E8E3D8] p-4 sm:p-6 shadow-xs mb-5">
                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <h3 className="text-sm font-serif font-bold text-[#1C1B1A]">
                      Selected Files ({selectedFiles.length})
                    </h3>
                    <span className="text-xs text-[#7A7875]">
                      Total: {formatBytes(totalBytesSelected)}
                    </span>
                  </div>

                  {!isUploading && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-xs text-[#9E7D46] hover:text-[#846231] font-semibold"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Staging Thumbnails Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1 mb-5">
                  {selectedFiles.map((item) => (
                    <div
                      key={item.id}
                      className="relative aspect-square rounded-xl overflow-hidden bg-[#EFECE6] border border-[#DDD7CB] group shadow-2xs"
                    >
                      {item.mediaType === 'video' ? (
                        <video
                          src={item.previewUrl}
                          className="w-full h-full object-cover"
                          muted
                        />
                      ) : (
                        <img
                          src={item.previewUrl}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                      )}

                      {/* Remove Button */}
                      {!isUploading && item.status !== 'success' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(item.id)}
                          aria-label={`Remove ${item.fileName}`}
                          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-colors shadow-xs"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Per-item status indicator */}
                      {item.status === 'uploading' && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-[#D8C7A5] mb-1" />
                          <span className="text-[10px] font-mono">{item.progress}%</span>
                        </div>
                      )}

                      {item.status === 'success' && (
                        <div className="absolute inset-0 bg-emerald-950/70 flex items-center justify-center text-white">
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        </div>
                      )}

                      {item.status === 'error' && (
                        <div className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center text-white p-1 text-center">
                          <AlertCircle className="w-4 h-4 text-red-400 mb-0.5" />
                          <span className="text-[9px] text-red-200 leading-tight mb-1">Failed</span>
                          <button
                            type="button"
                            onClick={() => handleRetryItem(item.id)}
                            className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white text-[9px] text-white hover:text-black font-semibold"
                          >
                            <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                            <span>Retry</span>
                          </button>
                        </div>
                      )}

                      {/* Type and size badge */}
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/90">
                        {formatBytes(item.fileSize)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload Action / Cancel Button for Desktop */}
                <div className="hidden sm:flex items-center space-x-3">
                  <button
                    type="button"
                    disabled={isUploading || selectedFiles.length === 0}
                    onClick={handleStartUpload}
                    className="flex-1 py-3.5 px-6 rounded-2xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs sm:text-sm font-semibold shadow-md transition-all active:scale-[0.99] flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-[#D8C7A5]" />
                        <span>
                          Uploading ({successCount} of {selectedFiles.length})...
                        </span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4 text-[#D8C7A5]" />
                        <span>
                          Upload {selectedFiles.length} Selected{' '}
                          {selectedFiles.length === 1 ? 'Memory' : 'Memories'}
                        </span>
                      </>
                    )}
                  </button>

                  {isUploading && (
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="py-3.5 px-4 rounded-2xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-xs font-semibold text-[#1C1B1A]"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Mobile Sticky Bottom Floating Action Bar */}
            {hasSelected && (
              <div className="sm:hidden fixed bottom-3 inset-x-3 z-30 bg-[#1C1B1A] text-white rounded-2xl p-3 shadow-2xl border border-white/10 flex items-center justify-between animate-fade-in">
                <div className="truncate mr-2">
                  <div className="text-xs font-semibold truncate">
                    {selectedFiles.length} files selected
                  </div>
                  <div className="text-[10px] text-white/70">
                    {formatBytes(totalBytesSelected)}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {isUploading ? (
                    <button
                      type="button"
                      onClick={handleCancelUpload}
                      className="px-3 py-2 rounded-xl bg-white/20 text-xs font-semibold"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartUpload}
                      className="px-4 py-2.5 rounded-xl bg-[#9E7D46] hover:bg-[#856734] text-white text-xs font-bold shadow-xs flex items-center space-x-1.5 active:scale-95 transition-transform"
                    >
                      <UploadCloud className="w-4 h-4" />
                      <span>Upload</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Minimal Footer */}
        <div className="text-center text-[10px] sm:text-[11px] text-[#A3A09A] mt-6">
          <span>Protected guest media drop • Powered by PaperDreams LUXE</span>
        </div>
      </div>
    </div>
  );
};
