import React, { useEffect, useState, useRef } from 'react';
import {
  Calendar,
  MapPin,
  QrCode,
  Copy,
  Check,
  Edit3,
  Trash2,
  Power,
  ArrowLeft,
  Download,
  AlertCircle,
  X,
  ExternalLink,
  Camera,
  UploadCloud,
  Video,
  Plus,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EventItem, UploadItem } from '../types';
import {
  getEventById,
  updateEvent,
  deleteEvent,
  subscribeEventUploads,
  deleteUpload,
  uploadGuestMedia,
  uploadEventBanner,
  DEFAULT_BANNERS,
} from '../services/eventService';
import { QRCodeModal } from '../components/QRCodeModal';
import { MediaGrid } from '../components/MediaGrid';
import { MediaViewerModal } from '../components/MediaViewerModal';
import { buildGuestEventUrl } from '../utils/domain';
import { generateUnguessableToken, formatBytes } from '../utils/security';

interface EventDetailPageProps {
  eventId: string;
  onNavigate: (path: string) => void;
}

export const EventDetailPage: React.FC<EventDetailPageProps> = ({ eventId, onNavigate }) => {
  const { user, isAdmin, profile } = useAuth();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Viewers
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [selectedUpload, setSelectedUpload] = useState<UploadItem | null>(null);
  const [isDeletingUpload, setIsDeletingUpload] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [deleteEventModal, setDeleteEventModal] = useState(false);

  // Admin / Organizer direct media capture & upload state
  const [adminFiles, setAdminFiles] = useState<{
    id: string;
    file: File;
    preview: string;
    progress: number;
    status: 'idle' | 'uploading' | 'success' | 'error';
    error?: string;
  }[]>([]);
  const [isAdminUploading, setIsAdminUploading] = useState(false);
  const photoCameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const videoCameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const filePickerInputRef = React.useRef<HTMLInputElement | null>(null);

  // Filter
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBanner, setEditBanner] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled'>('active');
  const [editMaxFiles, setEditMaxFiles] = useState(30);
  const [editMaxSize, setEditMaxSize] = useState(50);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let unsubUploads: (() => void) | undefined;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getEventById(eventId);
        if (!data) {
          setError('Event not found or has been removed.');
          setLoading(false);
          return;
        }

        // Check organizer permission
        const userEmail = (user?.email || '').trim().toLowerCase();
        const isAssigned =
          Boolean(isAdmin) ||
          (Array.isArray(data.organizerIds) && data.organizerIds.includes(user?.uid || '')) ||
          (userEmail && Array.isArray(data.organizerEmails) && data.organizerEmails.map(e => e.toLowerCase().trim()).includes(userEmail)) ||
          (Array.isArray(profile?.assignedEventIds) && profile.assignedEventIds.includes(eventId));

        if (!isAdmin && !isAssigned) {
          setError('Access restricted. You are not assigned to manage this event.');
          setLoading(false);
          return;
        }

        // Auto-heal UID in organizerIds if missing
        if (!isAdmin && user?.uid && (!Array.isArray(data.organizerIds) || !data.organizerIds.includes(user.uid))) {
          updateEvent(eventId, {
            organizerIds: Array.from(new Set([...(data.organizerIds || []), user.uid])),
          }).catch(() => {});
        }

        setEvent(data);
        setEditName(data.name);
        setEditDesc(data.description || '');
        setEditDate(data.date || '');
        setEditLocation(data.location || '');
        setEditBanner(data.bannerUrl || DEFAULT_BANNERS[0]);
        setEditStatus(data.status);
        setEditMaxFiles(data.maxFilesPerGuest || 30);
        setEditMaxSize(data.maxFileSizeMb || 50);

        // Subscribe to uploads
        unsubUploads = subscribeEventUploads(eventId, (items) => {
          setUploads(items);
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching event.');
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      load();
    }

    return () => {
      if (unsubUploads) unsubUploads();
    };
  }, [eventId, user, isAdmin]);

  const guestUrl = event ? buildGuestEventUrl(event.publicToken) : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.warn('Copy link failed:', e);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event) return;

    try {
      setSavingEdit(true);
      const updates: Partial<EventItem> = {
        name: editName.trim(),
        description: editDesc.trim(),
        date: editDate.trim(),
        location: editLocation.trim(),
        bannerUrl: editBanner.trim(),
      };

      if (isAdmin) {
        updates.status = editStatus;
        updates.maxFilesPerGuest = editMaxFiles;
        updates.maxFileSizeMb = editMaxSize;
      }

      await updateEvent(event.id, updates);
      setEvent((prev) => (prev ? { ...prev, ...updates } : prev));
      setIsEditOpen(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not save event changes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEditBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG, PNG, WebP) for the banner.');
      return;
    }

    try {
      setUploadingBanner(true);
      const url = await uploadEventBanner(file, event?.id || 'banners');
      setEditBanner(url);
    } catch (err: unknown) {
      console.error('Failed to upload banner:', err);
      alert(err instanceof Error ? err.message : 'Could not upload banner photo.');
    } finally {
      setUploadingBanner(false);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
  };

  const handleDeleteUpload = async (upload: UploadItem) => {
    if (!event) return;
    if (!window.confirm(`Delete "${upload.safeDisplayName || upload.fileName}" permanently?`)) return;

    try {
      setIsDeletingUpload(true);
      await deleteUpload(upload.id, upload.storagePath, event.id);
      setSelectedUpload(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete upload.');
    } finally {
      setIsDeletingUpload(false);
    }
  };

  const handleDeleteEntireEvent = async () => {
    if (!event) return;
    try {
      await deleteEvent(event.id);
      onNavigate(isAdmin ? '/admin' : '/organizer');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete event.');
    }
  };

  const handleAdminFilesAdded = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const incoming = Array.from(e.target.files);
    e.target.value = '';

    const newItems = incoming.map((f) => ({
      id: generateUnguessableToken(12),
      file: f,
      preview: URL.createObjectURL(f),
      progress: 0,
      status: 'idle' as const,
    }));

    setAdminFiles((prev) => [...prev, ...newItems]);
    setIsAddMediaOpen(true);
  };

  const handleRemoveAdminFile = (id: string) => {
    setAdminFiles((prev) => {
      const match = prev.find((f) => f.id === id);
      if (match?.preview) URL.revokeObjectURL(match.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleUploadAdminFiles = async () => {
    if (!event || adminFiles.length === 0 || isAdminUploading) return;
    setIsAdminUploading(true);

    const updated = [...adminFiles];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      if (item.status === 'success') continue;
      item.status = 'uploading';
      setAdminFiles([...updated]);

      try {
        const hostName = user?.displayName || user?.email?.split('@')[0] || (isAdmin ? 'Super Admin' : 'Host');
        await uploadGuestMedia({
          eventId: event.id,
          publicToken: event.publicToken,
          file: item.file,
          uploaderSessionId: user?.uid || 'host_portal',
          guestName: `${hostName} (Host)`,
          onProgress: (pct) => {
            item.progress = pct;
            setAdminFiles([...updated]);
          },
        });
        item.status = 'success';
        item.progress = 100;
        setAdminFiles([...updated]);
      } catch (err: unknown) {
        item.status = 'error';
        item.error = err instanceof Error ? err.message : 'Upload failed';
        setAdminFiles([...updated]);
      }
    }

    setIsAdminUploading(false);
    const allDone = updated.every((f) => f.status === 'success');
    if (allDone) {
      setTimeout(() => {
        updated.forEach((f) => URL.revokeObjectURL(f.preview));
        setAdminFiles([]);
        setIsAddMediaOpen(false);
      }, 1000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="w-10 h-10 border-2 border-[#9E7D46] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-xs text-[#7A7875]">Loading event and media archive...</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-serif font-bold text-[#1C1B1A] mb-2">Notice</h3>
        <p className="text-xs text-[#7A7875] mb-6">{error || 'Event not available'}</p>
        <button
          onClick={() => onNavigate(isAdmin ? '/admin' : '/organizer')}
          className="px-5 py-2.5 rounded-xl bg-[#1C1B1A] text-white text-xs font-semibold"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const imageCount = uploads.filter((u) => u.mediaType === 'image').length;
  const videoCount = uploads.filter((u) => u.mediaType === 'video').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-20">
      {/* Back button */}
      <button
        onClick={() => onNavigate(isAdmin ? '/admin' : '/organizer')}
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-[#7A7875] hover:text-[#1C1B1A] mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Events</span>
      </button>

      {/* Hero Banner Section */}
      <div className="relative rounded-3xl overflow-hidden bg-[#1C1B1A] text-white shadow-md border border-[#DDD7CB] mb-8">
        <div className="h-56 sm:h-72 w-full relative">
          <img
            src={event.bannerUrl}
            alt={event.name}
            className="w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

          {/* Status pill top-left */}
          <div className="absolute top-4 left-4 flex items-center space-x-2">
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md ${
                event.status === 'active'
                  ? 'bg-emerald-500/90 text-white'
                  : 'bg-zinc-700/90 text-zinc-300'
              }`}
            >
              {event.status === 'active' ? 'Uploads Active' : 'Event Disabled'}
            </span>
          </div>

          {/* Action buttons top-right */}
          <div className="absolute top-4 right-4 flex items-center space-x-2">
            <button
              onClick={() => setIsEditOpen(true)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md text-xs font-semibold text-white transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5 text-[#D8C7A5]" />
              <span className="hidden sm:inline">Edit Details</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setDeleteEventModal(true)}
                className="p-2 rounded-xl bg-red-600/70 hover:bg-red-600 backdrop-blur-md text-white transition-colors"
                title="Delete event"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Event Details bottom */}
          <div className="absolute bottom-6 left-6 right-6">
            <h1 className="text-2xl sm:text-4xl font-serif font-bold text-white tracking-tight">
              {event.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-white/80 mt-2">
              {event.date && (
                <span className="flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-[#D8C7A5]" />
                  <span>{event.date}</span>
                </span>
              )}
              {event.location && (
                <span className="flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-[#D8C7A5]" />
                  <span>{event.location}</span>
                </span>
              )}
              <span className="text-white/60">
                Limit: {event.maxFilesPerGuest} files ({event.maxFileSizeMb}MB)
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar Bar */}
        <div className="bg-[#161514] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-white/10 text-xs">
          <div className="flex items-center space-x-2 flex-1 max-w-lg">
            <span className="text-[#9E7D46] font-semibold uppercase tracking-wider text-[10px] shrink-0">
              Guest Link:
            </span>
            <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 flex-1 truncate font-mono text-white/80 select-all">
              {guestUrl}
            </div>
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white shrink-0 transition-colors"
              title="Copy guest link"
            >
              {copiedLink ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="flex items-center space-x-3 self-end md:self-auto">
            <button
              onClick={() => setIsQrOpen(true)}
              className="flex items-center space-x-1.5 py-2 px-4 rounded-xl bg-[#9E7D46] hover:bg-[#856734] text-white font-semibold transition-colors shadow-xs"
            >
              <QrCode className="w-4 h-4" />
              <span>Show QR Code</span>
            </button>

            <a
              href={guestUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Guest View</span>
            </a>
          </div>
        </div>
      </div>

      {/* Gallery Filter & Counters with Direct Upload */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1C1B1A]">
            Media Archive ({uploads.length})
          </h2>
          <p className="text-xs text-[#7A7875] mt-0.5">
            Real-time feed of photos and videos. Super Admin & Organizers can take, add, and delete items.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Media Action Button */}
          <button
            onClick={() => setIsAddMediaOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-[#1C1B1A] text-white text-xs font-semibold hover:bg-[#333230] shadow-xs transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-[#D8C7A5]" />
            <span>Add Photos & Videos</span>
          </button>

          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-[#DDD7CB] self-start sm:self-auto">
            <button
              onClick={() => setMediaFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                mediaFilter === 'all'
                  ? 'bg-[#1C1B1A] text-white'
                  : 'text-[#6E6D6B] hover:text-[#1C1B1A]'
              }`}
            >
              All ({uploads.length})
            </button>
            <button
              onClick={() => setMediaFilter('image')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                mediaFilter === 'image'
                  ? 'bg-[#1C1B1A] text-white'
                  : 'text-[#6E6D6B] hover:text-[#1C1B1A]'
              }`}
            >
              Photos ({imageCount})
            </button>
            <button
              onClick={() => setMediaFilter('video')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                mediaFilter === 'video'
                  ? 'bg-[#1C1B1A] text-white'
                  : 'text-[#6E6D6B] hover:text-[#1C1B1A]'
              }`}
            >
              Videos ({videoCount})
            </button>
          </div>
        </div>
      </div>

      {/* Media Grid */}
      <MediaGrid
        uploads={uploads}
        onSelect={(up) => setSelectedUpload(up)}
        onDelete={(up) => handleDeleteUpload(up)}
        filter={mediaFilter}
      />

      {/* Media Viewer Lightbox */}
      {selectedUpload && (
        <MediaViewerModal
          upload={selectedUpload}
          onClose={() => setSelectedUpload(null)}
          onDelete={handleDeleteUpload}
          isDeleting={isDeletingUpload}
        />
      )}

      {/* QR Code Modal */}
      {isQrOpen && (
        <QRCodeModal
          isOpen={isQrOpen}
          onClose={() => setIsQrOpen(false)}
          guestUrl={guestUrl}
          eventName={event.name}
        />
      )}

      {/* Add Photos & Videos Modal for Admin / Organizer */}
      {isAddMediaOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E3D8] rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                if (!isAdminUploading) {
                  adminFiles.forEach((f) => URL.revokeObjectURL(f.preview));
                  setAdminFiles([]);
                  setIsAddMediaOpen(false);
                }
              }}
              disabled={isAdminUploading}
              className="absolute top-4 right-4 p-2 text-[#7A7875] hover:text-[#1C1B1A] rounded-full disabled:opacity-30 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-serif font-bold text-[#1C1B1A] mb-1">
              Add Photos & Videos
            </h3>
            <p className="text-xs text-[#6E6D6B] mb-5">
              Take photos or videos directly with your device or upload high-resolution files to the event gallery.
            </p>

            {/* Hidden Input Triggers */}
            <input
              ref={photoCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAdminFilesAdded}
              className="hidden"
            />
            <input
              ref={videoCameraInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={handleAdminFilesAdded}
              className="hidden"
            />
            <input
              ref={filePickerInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={handleAdminFilesAdded}
              className="hidden"
            />

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              <button
                type="button"
                onClick={() => photoCameraInputRef.current?.click()}
                disabled={isAdminUploading}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#FAF9F5] hover:bg-[#F2EEE4] border border-[#DDD7CB] text-[#1C1B1A] transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-center"
              >
                <div className="w-9 h-9 rounded-full bg-[#EAE5D8] flex items-center justify-center mb-1.5">
                  <Camera className="w-4 h-4 text-[#9E7D46]" />
                </div>
                <span className="text-xs font-semibold">Take Photo</span>
                <span className="text-[10px] text-[#7A7875]">Camera</span>
              </button>

              <button
                type="button"
                onClick={() => videoCameraInputRef.current?.click()}
                disabled={isAdminUploading}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#FAF9F5] hover:bg-[#F2EEE4] border border-[#DDD7CB] text-[#1C1B1A] transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-center"
              >
                <div className="w-9 h-9 rounded-full bg-[#EAE5D8] flex items-center justify-center mb-1.5">
                  <Video className="w-4 h-4 text-[#9E7D46]" />
                </div>
                <span className="text-xs font-semibold">Take Video</span>
                <span className="text-[10px] text-[#7A7875]">Clips</span>
              </button>

              <button
                type="button"
                onClick={() => filePickerInputRef.current?.click()}
                disabled={isAdminUploading}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#FAF9F5] hover:bg-[#F2EEE4] border border-[#DDD7CB] text-[#1C1B1A] transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-center"
              >
                <div className="w-9 h-9 rounded-full bg-[#EAE5D8] flex items-center justify-center mb-1.5">
                  <ImageIcon className="w-4 h-4 text-[#9E7D46]" />
                </div>
                <span className="text-xs font-semibold">Gallery</span>
                <span className="text-[10px] text-[#7A7875]">Files</span>
              </button>
            </div>

            {/* Selected Queue List */}
            {adminFiles.length > 0 ? (
              <div className="space-y-3 mb-5">
                <div className="flex items-center justify-between text-xs text-[#7A7875]">
                  <span>{adminFiles.length} item(s) ready</span>
                  {!isAdminUploading && (
                    <button
                      onClick={() => {
                        adminFiles.forEach((f) => URL.revokeObjectURL(f.preview));
                        setAdminFiles([]);
                      }}
                      className="text-red-600 hover:underline cursor-pointer"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {adminFiles.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center space-x-3 p-2 bg-[#FAF9F5] border border-[#DDD7CB] rounded-xl text-xs"
                    >
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black/10">
                        {item.file.type.startsWith('video/') ? (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-white">
                            <Video className="w-4 h-4" />
                          </div>
                        ) : (
                          <img
                            src={item.preview}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[#1C1B1A] truncate">
                          {item.file.name}
                        </div>
                        <div className="text-[10px] text-[#7A7875]">
                          {formatBytes(item.file.size)} •{' '}
                          {item.status === 'uploading' ? (
                            <span className="text-amber-600 font-semibold">{item.progress}% uploading...</span>
                          ) : item.status === 'success' ? (
                            <span className="text-emerald-600 font-semibold">Uploaded</span>
                          ) : item.status === 'error' ? (
                            <span className="text-red-600 font-semibold">{item.error || 'Failed'}</span>
                          ) : (
                            'Ready'
                          )}
                        </div>
                      </div>
                      {!isAdminUploading && item.status !== 'success' && (
                        <button
                          onClick={() => handleRemoveAdminFile(item.id)}
                          className="p-1.5 text-[#7A7875] hover:text-red-600 rounded-lg cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleUploadAdminFiles}
                  disabled={isAdminUploading || adminFiles.every((f) => f.status === 'success')}
                  className="w-full py-3 px-4 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold flex items-center justify-center space-x-2 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 text-[#D8C7A5]" />
                  <span>
                    {isAdminUploading ? 'Uploading Media...' : 'Upload to Gallery'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="p-6 text-center border-2 border-dashed border-[#DDD7CB] rounded-2xl text-xs text-[#7A7875] mb-4">
                Choose a camera or browse your device above to add photos and videos to this event.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E3D8] rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsEditOpen(false)}
              className="absolute top-4 right-4 p-2 text-[#7A7875] hover:text-[#1C1B1A] rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-serif font-bold text-[#1C1B1A] mb-1">
              Edit Event Details
            </h3>
            <p className="text-xs text-[#6E6D6B] mb-5">
              Update event headline, venue, date, and banner cover art.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                  Event Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                    Event Date
                  </label>
                  <input
                    type="text"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                    Venue
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                  Guest Welcome Message
                </label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
                  Event Cover Banner
                </label>
                {editBanner && (
                  <div className="relative h-28 w-full rounded-xl overflow-hidden mb-2.5 bg-[#E8E3D8] border border-[#DDD7CB]">
                    <img
                      src={editBanner}
                      alt="Banner Preview"
                      className="w-full h-full object-cover"
                    />
                    {uploadingBanner && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white space-x-2 text-xs font-semibold">
                        <Loader2 className="w-4 h-4 animate-spin text-[#D8C7A5]" />
                        <span>Uploading...</span>
                      </div>
                    )}
                  </div>
                )}

                <input
                  ref={bannerFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditBannerFileChange}
                  className="hidden"
                />

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                  <button
                    type="button"
                    disabled={uploadingBanner}
                    onClick={() => bannerFileInputRef.current?.click()}
                    className="inline-flex items-center justify-center space-x-2 px-3.5 py-2 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-[#D8C7A5]" />
                    <span>{uploadingBanner ? 'Uploading Photo...' : 'Upload Cover Photo'}</span>
                  </button>
                  <span className="text-[11px] text-[#8C8983]">
                    Or edit the image URL directly:
                  </span>
                </div>

                <input
                  type="url"
                  value={editBanner}
                  onChange={(e) => setEditBanner(e.target.value)}
                  placeholder="https://example.com/cover.jpg"
                  className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                />
              </div>

              {isAdmin && (
                <div className="pt-3 border-t border-[#F0EBE0] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[#1C1B1A]">Event Availability</div>
                      <div className="text-[11px] text-[#7A7875]">Disabled events reject guest uploads</div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditStatus((s) => (s === 'active' ? 'disabled' : 'active'))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        editStatus === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      {editStatus === 'active' ? 'Active' : 'Disabled'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                        Max Files: {editMaxFiles}
                      </label>
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={editMaxFiles}
                        onChange={(e) => setEditMaxFiles(Number(e.target.value))}
                        className="w-full accent-[#1C1B1A]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                        Max Size: {editMaxSize} MB
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="250"
                        step="10"
                        value={editMaxSize}
                        onChange={(e) => setEditMaxSize(Number(e.target.value))}
                        className="w-full accent-[#1C1B1A]"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-xs font-semibold text-[#1C1B1A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="py-2.5 px-5 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-xs font-semibold text-white shadow-xs disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Event Modal */}
      {deleteEventModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E3D8] rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl text-center">
            <Trash2 className="w-8 h-8 text-red-600 mx-auto mb-2" />
            <h4 className="text-base font-serif font-bold text-[#1C1B1A]">Delete entire event?</h4>
            <p className="text-xs text-[#7A7875] mt-1 mb-5">
              This will permanently delete this event, its public guest link, and all uploaded media. This action is irreversible.
            </p>
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={handleDeleteEntireEvent}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700"
              >
                Delete Event
              </button>
              <button
                onClick={() => setDeleteEventModal(false)}
                className="px-4 py-2 bg-[#EBE5D8] text-[#1C1B1A] rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
