import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  MapPin,
  Image as ImageIcon,
  Sliders,
  Users,
  ArrowLeft,
  Check,
  AlertCircle,
  Sparkles,
  UploadCloud,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createEvent, DEFAULT_BANNERS, uploadEventBanner } from '../services/eventService';
import { fetchOrganizers } from '../services/userService';
import { UserProfile } from '../types';

interface EventCreatePageProps {
  onNavigate: (path: string) => void;
}

export const EventCreatePage: React.FC<EventCreatePageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [bannerUrl, setBannerUrl] = useState(DEFAULT_BANNERS[0]);
  const [customBanner, setCustomBanner] = useState('');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerUploadProgress, setBannerUploadProgress] = useState<number | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [maxFilesPerGuest, setMaxFilesPerGuest] = useState(30);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(50);
  const [allowImages, setAllowImages] = useState(true);
  const [allowVideos, setAllowVideos] = useState(true);

  const [organizers, setOrganizers] = useState<UserProfile[]>([]);
  const [selectedOrganizers, setSelectedOrganizers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrganizers()
      .then((data) => setOrganizers(data))
      .catch((e) => console.warn('Could not fetch organizers list:', e));
  }, []);

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, WebP) for the banner.');
      return;
    }

    try {
      setUploadingBanner(true);
      setBannerUploadProgress(10);
      setError(null);
      const url = await uploadEventBanner(file, 'banners', (p) => setBannerUploadProgress(p));
      setCustomBanner(url);
      setBannerUrl(url);
    } catch (err: unknown) {
      console.error('Banner upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload event banner.');
    } finally {
      setUploadingBanner(false);
      setBannerUploadProgress(null);
      if (bannerFileInputRef.current) bannerFileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Event name is required.');
      return;
    }

    const allowedTypes: string[] = [];
    if (allowImages) allowedTypes.push('image');
    if (allowVideos) allowedTypes.push('video');

    if (allowedTypes.length === 0) {
      setError('You must allow either photos or videos.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const chosenBanner = customBanner.trim() ? customBanner.trim() : bannerUrl;
      const selectedOrganizerEmails = organizers
        .filter((o) => selectedOrganizers.includes(o.uid))
        .map((o) => o.email.toLowerCase());

      const newId = await createEvent({
        name,
        description,
        date,
        location,
        bannerUrl: chosenBanner,
        organizerIds: selectedOrganizers,
        organizerEmails: selectedOrganizerEmails,
        maxFilesPerGuest,
        maxFileSizeMb,
        allowedTypes,
        createdBy: user?.uid || 'superadmin',
      });

      onNavigate(`/admin/events/${newId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Top back button */}
      <button
        onClick={() => onNavigate('/admin')}
        className="inline-flex items-center space-x-1.5 text-xs font-semibold text-[#7A7875] hover:text-[#1C1B1A] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Events</span>
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs uppercase tracking-widest font-semibold">
            Event Setup
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1B1A]">
          Create New Event
        </h1>
        <p className="text-xs sm:text-sm text-[#6E6D6B] mt-1">
          Generate an unguessable guest link and QR code, designate banner art, and specify upload limits.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center space-x-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Details Card */}
        <div className="bg-white rounded-3xl border border-[#E8E3D8] p-6 sm:p-8 shadow-xs">
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-4 flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-[#9E7D46]" />
            <span>Event Identity</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
                Event Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Charlotte & Julian's Wedding Gala"
                className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] focus:bg-white rounded-xl text-xs sm:text-sm text-[#1C1B1A] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
                Event Date
              </label>
              <input
                type="text"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="e.g. October 15, 2026"
                className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] focus:bg-white rounded-xl text-xs text-[#1C1B1A] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
                Venue / Location
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-[#9E9B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Villa Florentine, Tuscany"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] focus:bg-white rounded-xl text-xs text-[#1C1B1A] outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
                Welcome Message for Guests
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Share your favorite moments, candid snapshots, and videos from our celebration! No app or account needed."
                className="w-full px-4 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] focus:bg-white rounded-xl text-xs text-[#1C1B1A] outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Banner Selection Card */}
        <div className="bg-white rounded-3xl border border-[#E8E3D8] p-6 sm:p-8 shadow-xs">
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-2 flex items-center space-x-2">
            <ImageIcon className="w-4 h-4 text-[#9E7D46]" />
            <span>Event Cover Banner</span>
          </h3>
          <p className="text-xs text-[#7A7875] mb-5">
            This banner welcomes guests at the top of the mobile upload page.
          </p>

          {/* Banner Preview */}
          <div className="relative h-44 w-full rounded-2xl overflow-hidden mb-5 bg-[#E8E3D8] border border-[#DDD7CB]">
            <img
              src={customBanner.trim() || bannerUrl}
              alt="Banner Preview"
              className="w-full h-full object-cover"
            />
            {uploadingBanner && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-[#D8C7A5]" />
                <span className="text-xs font-semibold">
                  Uploading Cover Photo {bannerUploadProgress ? `(${bannerUploadProgress}%)` : ''}...
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4 text-white">
              <span className="text-xs font-medium bg-black/40 backdrop-blur-xs px-2.5 py-1 rounded-md">
                Live Banner Preview
              </span>
            </div>
          </div>

          {/* Preset Banners Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-5">
            {DEFAULT_BANNERS.map((url, i) => (
              <button
                type="button"
                key={i}
                onClick={() => {
                  setBannerUrl(url);
                  setCustomBanner('');
                }}
                className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                  bannerUrl === url && !customBanner
                    ? 'border-[#9E7D46] ring-2 ring-[#9E7D46]/30'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={url} alt={`Preset ${i + 1}`} className="w-full h-full object-cover" />
                {bannerUrl === url && !customBanner && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#9E7D46] text-white flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Upload Banner & Custom URL Options */}
          <div className="space-y-3.5 pt-3 border-t border-[#F0EBE0]">
            <div>
              <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
                Upload Cover Photo from Device
              </label>
              <input
                ref={bannerFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerFileChange}
                className="hidden"
              />
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <button
                  type="button"
                  disabled={uploadingBanner}
                  onClick={() => bannerFileInputRef.current?.click()}
                  className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  <UploadCloud className="w-4 h-4 text-[#D8C7A5]" />
                  <span>
                    {uploadingBanner
                      ? `Uploading Photo (${bannerUploadProgress || 0}%)...`
                      : 'Choose Photo from Device'}
                  </span>
                </button>
                {customBanner && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomBanner('');
                      setBannerUrl(DEFAULT_BANNERS[0]);
                    }}
                    className="text-xs text-[#9E7D46] hover:text-[#846231] font-medium px-2 py-1 underline cursor-pointer"
                  >
                    Reset to Default Banner
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#8C8983] mt-1.5">
                Supports JPG, PNG, or WebP. The photo will be automatically saved and displayed as the event's header.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                Or paste a Custom Image URL
              </label>
              <input
                type="url"
                value={customBanner}
                onChange={(e) => setCustomBanner(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                className="w-full px-3.5 py-2 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Upload Limits & Controls */}
        <div className="bg-white rounded-3xl border border-[#E8E3D8] p-6 sm:p-8 shadow-xs">
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-2 flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-[#9E7D46]" />
            <span>Upload Policy & Limits</span>
          </h3>
          <p className="text-xs text-[#7A7875] mb-5">
            Configure upload quotas and allowed media types.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-[#4A4947]">
                  Max Files Per Guest
                </label>
                <span className="text-xs font-bold text-[#1C1B1A] font-mono">
                  {maxFilesPerGuest} files
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={maxFilesPerGuest}
                onChange={(e) => setMaxFilesPerGuest(Number(e.target.value))}
                className="w-full accent-[#1C1B1A]"
              />
              <span className="text-[11px] text-[#8C8983]">
                Limits number of files a single guest can queue per session.
              </span>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-semibold text-[#4A4947]">
                  Max File Size
                </label>
                <span className="text-xs font-bold text-[#1C1B1A] font-mono">
                  {maxFileSizeMb} MB
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="250"
                step="10"
                value={maxFileSizeMb}
                onChange={(e) => setMaxFileSizeMb(Number(e.target.value))}
                className="w-full accent-[#1C1B1A]"
              />
              <span className="text-[11px] text-[#8C8983]">
                Maximum individual size allowed for high-res photos and video clips.
              </span>
            </div>

            <div className="sm:col-span-2 pt-2">
              <label className="block text-xs font-semibold text-[#4A4947] mb-2">
                Permitted Media Types
              </label>
              <div className="flex items-center space-x-6">
                <label className="flex items-center space-x-2 text-xs text-[#1C1B1A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowImages}
                    onChange={(e) => setAllowImages(e.target.checked)}
                    className="rounded text-[#1C1B1A] focus:ring-0"
                  />
                  <span>Photos (JPEG, PNG, HEIC, WebP)</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-[#1C1B1A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowVideos}
                    onChange={(e) => setAllowVideos(e.target.checked)}
                    className="rounded text-[#1C1B1A] focus:ring-0"
                  />
                  <span>Videos (MP4, MOV, WebM)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Organizer Assignment Card */}
        <div className="bg-white rounded-3xl border border-[#E8E3D8] p-6 sm:p-8 shadow-xs">
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-2 flex items-center space-x-2">
            <Users className="w-4 h-4 text-[#9E7D46]" />
            <span>Assign Organizers</span>
          </h3>
          <p className="text-xs text-[#7A7875] mb-4">
            Assigned organizers will be able to review guest uploads and download the event QR code.
          </p>

          {organizers.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#DDD7CB] text-xs text-[#7A7875]">
              No organizer accounts currently registered. You can assign organizers at any time later from the Organizers tab.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto p-2 bg-[#FAF9F5] border border-[#DDD7CB] rounded-2xl">
              {organizers.map((org) => {
                const isSelected = selectedOrganizers.includes(org.uid);
                return (
                  <label
                    key={org.uid}
                    className={`flex items-center space-x-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white border-[#1C1B1A] shadow-xs'
                        : 'bg-white/60 border-transparent hover:bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedOrganizers((prev) => prev.filter((id) => id !== org.uid));
                        } else {
                          setSelectedOrganizers((prev) => [...prev, org.uid]);
                        }
                      }}
                      className="rounded text-[#1C1B1A] focus:ring-0"
                    />
                    <div className="truncate">
                      <div className="text-xs font-semibold text-[#1C1B1A] truncate">{org.name}</div>
                      <div className="text-[10px] text-[#7A7875] truncate">{org.email}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end space-x-4 pt-4">
          <button
            type="button"
            onClick={() => onNavigate('/admin')}
            className="py-3 px-6 rounded-xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-xs font-semibold text-[#1C1B1A] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="py-3 px-8 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-xs font-semibold text-white shadow-md transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Creating Event...' : 'Create Event & Generate Guest Link'}
          </button>
        </div>
      </form>
    </div>
  );
};
