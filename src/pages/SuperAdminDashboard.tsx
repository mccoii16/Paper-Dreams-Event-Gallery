import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Plus,
  Users,
  Image as ImageIcon,
  QrCode,
  ExternalLink,
  Power,
  Trash2,
  MapPin,
  Search,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EventItem } from '../types';
import { subscribeEvents, updateEvent, deleteEvent } from '../services/eventService';
import { QRCodeModal } from '../components/QRCodeModal';
import { buildGuestEventUrl } from '../utils/domain';

interface SuperAdminDashboardProps {
  onNavigate: (path: string) => void;
}

export const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ onNavigate }) => {
  const { user, isAdmin } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [selectedQrEvent, setSelectedQrEvent] = useState<EventItem | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const unsub = subscribeEvents(user.uid, true, (items) => {
      setEvents(items);
      setLoading(false);
    });
    return () => unsub();
  }, [user, isAdmin]);

  const handleToggleStatus = async (ev: EventItem) => {
    try {
      setActionError(null);
      const nextStatus = ev.status === 'active' ? 'disabled' : 'active';
      await updateEvent(ev.id, { status: nextStatus });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not change status');
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      setActionError(null);
      await deleteEvent(eventId);
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not delete event');
    }
  };

  const getGuestUrl = (token: string) => {
    return buildGuestEventUrl(token);
  };

  const handleCopyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getGuestUrl(token));
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name.toLowerCase().includes(search.toLowerCase()) ||
      ev.location.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = filterStatus === 'all' || ev.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalUploads = events.reduce((sum, e) => sum + (e.uploadsCount || 0), 0);
  const activeCount = events.filter((e) => e.status === 'active').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
            <span className="text-xs uppercase tracking-widest font-semibold">
              Super Admin Control
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1B1A]">
            Event Operations & Media
          </h1>
          <p className="text-xs sm:text-sm text-[#6E6D6B] mt-1">
            Manage private events, assign organizers, configure guest upload limits, and inspect media galleries.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => onNavigate('/admin/organizers')}
            className="flex items-center space-x-1.5 py-2.5 px-4 rounded-xl bg-white border border-[#DDD7CB] hover:bg-[#F5F2EA] text-xs font-semibold text-[#1C1B1A] transition-colors"
          >
            <Users className="w-4 h-4 text-[#9E7D46]" />
            <span>Manage Organizers</span>
          </button>
          <button
            onClick={() => onNavigate('/admin/events/new')}
            className="flex items-center space-x-1.5 py-2.5 px-4 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4 text-[#D8C7A5]" />
            <span>Create Event</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-500 font-bold ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-[#E8E3D8] shadow-xs">
          <div className="flex items-center justify-between text-[#7A7875] mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Events</span>
            <Calendar className="w-4 h-4 text-[#9E7D46]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#1C1B1A]">{events.length}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E8E3D8] shadow-xs">
          <div className="flex items-center justify-between text-[#7A7875] mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Events</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#1C1B1A]">{activeCount}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E8E3D8] shadow-xs">
          <div className="flex items-center justify-between text-[#7A7875] mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Media Uploads</span>
            <ImageIcon className="w-4 h-4 text-[#9E7D46]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#1C1B1A]">{totalUploads}</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E8E3D8] shadow-xs">
          <div className="flex items-center justify-between text-[#7A7875] mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Guest Routes</span>
            <QrCode className="w-4 h-4 text-[#9E7D46]" />
          </div>
          <div className="text-xs text-[#52504E] font-medium mt-2">
            Encrypted Tokens Active
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#9E9B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by title or venue..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none transition-colors"
          />
        </div>

        <div className="flex items-center space-x-1.5 self-end sm:self-auto bg-white p-1 rounded-xl border border-[#DDD7CB]">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-[#1C1B1A] text-white'
                : 'text-[#6E6D6B] hover:text-[#1C1B1A]'
            }`}
          >
            All ({events.length})
          </button>
          <button
            onClick={() => setFilterStatus('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === 'active'
                ? 'bg-[#1C1B1A] text-white'
                : 'text-[#6E6D6B] hover:text-[#1C1B1A]'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterStatus('disabled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === 'disabled'
                ? 'bg-[#1C1B1A] text-white'
                : 'text-[#6E6D6B] hover:text-[#1C1B1A]'
            }`}
          >
            Disabled
          </button>
        </div>
      </div>

      {/* Events List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white rounded-2xl border border-[#E8E3D8] h-72 animate-pulse"
            />
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E3D8] p-12 text-center my-6">
          <Calendar className="w-10 h-10 text-[#9E7D46] mx-auto mb-3" />
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-1">No Events Found</h3>
          <p className="text-xs text-[#7A7875] max-w-sm mx-auto mb-5">
            {events.length === 0
              ? 'Get started by creating your first event to generate private guest upload tokens and assign organizers.'
              : 'No events match your search criteria.'}
          </p>
          {events.length === 0 && (
            <button
              onClick={() => onNavigate('/admin/events/new')}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#1C1B1A] text-white text-xs font-semibold shadow-sm"
            >
              <Plus className="w-4 h-4 text-[#D8C7A5]" />
              <span>Create First Event</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEvents.map((ev) => {
            const guestUrl = getGuestUrl(ev.publicToken);
            const isCopied = copiedToken === ev.publicToken;

            return (
              <div
                key={ev.id}
                className="bg-white rounded-2xl border border-[#E8E3D8] overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                {/* Banner Thumbnail */}
                <div className="relative h-44 w-full bg-[#E8E3D8] overflow-hidden">
                  <img
                    src={ev.bannerUrl}
                    alt={ev.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

                  {/* Status badge */}
                  <div className="absolute top-3 left-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md ${
                        ev.status === 'active'
                          ? 'bg-emerald-500/90 text-white'
                          : 'bg-zinc-700/90 text-zinc-200'
                      }`}
                    >
                      {ev.status}
                    </span>
                  </div>

                  {/* Uploads Count badge */}
                  <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-lg flex items-center space-x-1.5 font-medium">
                    <ImageIcon className="w-3.5 h-3.5 text-[#D8C7A5]" />
                    <span>{ev.uploadsCount || 0} media</span>
                  </div>

                  {/* Bottom title in banner */}
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h3 className="text-lg font-serif font-bold leading-tight truncate">
                      {ev.name}
                    </h3>
                    <div className="flex items-center space-x-3 text-xs text-white/80 mt-1">
                      {ev.date && <span>{ev.date}</span>}
                      {ev.location && (
                        <span className="flex items-center space-x-1 truncate">
                          <MapPin className="w-3 h-3 text-[#D8C7A5] shrink-0" />
                          <span className="truncate">{ev.location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  {/* Guest Link Quick Copy Bar */}
                  <div className="bg-[#FAF9F5] p-2.5 rounded-xl border border-[#E8E3D8] mb-4">
                    <div className="flex items-center justify-between text-[11px] text-[#7A7875] mb-1">
                      <span className="font-semibold uppercase tracking-wider text-[10px] text-[#9E7D46]">
                        Guest Drop Link
                      </span>
                      <button
                        onClick={() => setSelectedQrEvent(ev)}
                        className="flex items-center space-x-1 text-[#1C1B1A] hover:text-[#9E7D46] font-medium"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>QR Code</span>
                      </button>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs text-[#4A4947] truncate select-all flex-1">
                        /e/{ev.publicToken}
                      </span>
                      <button
                        onClick={() => handleCopyLink(ev.publicToken)}
                        className="p-1.5 rounded-lg bg-white border border-[#E0DBD0] hover:bg-[#F2EEE4] text-[#1C1B1A] transition-colors shrink-0"
                        title="Copy full guest link"
                      >
                        {isCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Organizers assigned info */}
                  <div className="flex items-center justify-between text-xs text-[#6E6D6B] mb-4 pt-1 border-t border-[#F0EBE0]">
                    <div className="flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-[#9E7D46]" />
                      <span>{ev.organizerIds?.length || 0} assigned organizers</span>
                    </div>
                    <div className="text-[11px]">
                      Limit: {ev.maxFilesPerGuest} files ({ev.maxFileSizeMb}MB)
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => onNavigate(`/admin/events/${ev.id}`)}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold text-center transition-colors flex items-center justify-center space-x-1.5 mr-2"
                    >
                      <span>Manage & Gallery</span>
                      <ExternalLink className="w-3.5 h-3.5 text-[#D8C7A5]" />
                    </button>

                    <button
                      onClick={() => handleToggleStatus(ev)}
                      title={ev.status === 'active' ? 'Disable event uploads' : 'Activate event'}
                      className={`p-2 rounded-xl border transition-colors mr-1.5 ${
                        ev.status === 'active'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-zinc-300 bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setDeleteConfirmId(ev.id)}
                      title="Delete event permanently"
                      className="p-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation Overlay */}
                {deleteConfirmId === ev.id && (
                  <div className="absolute inset-0 bg-white/95 backdrop-blur-xs p-6 rounded-2xl flex flex-col justify-center items-center text-center z-20">
                    <Trash2 className="w-8 h-8 text-red-600 mb-2" />
                    <h4 className="text-sm font-bold text-[#1C1B1A]">Delete this event?</h4>
                    <p className="text-xs text-[#7A7875] mt-1 mb-4 max-w-xs">
                      This will permanently remove the event, its guest upload token, and all associated media.
                    </p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors"
                      >
                        Confirm Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="px-4 py-2 bg-[#EBE5D8] text-[#1C1B1A] rounded-xl text-xs font-semibold hover:bg-[#E2DDD0] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* QR Code Modal */}
      {selectedQrEvent && (
        <QRCodeModal
          isOpen={Boolean(selectedQrEvent)}
          onClose={() => setSelectedQrEvent(null)}
          guestUrl={getGuestUrl(selectedQrEvent.publicToken)}
          eventName={selectedQrEvent.name}
        />
      )}
    </div>
  );
};
