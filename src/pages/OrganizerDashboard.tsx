import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Image as ImageIcon,
  QrCode,
  ExternalLink,
  MapPin,
  Search,
  Copy,
  Check,
  RotateCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EventItem } from '../types';
import { subscribeEvents } from '../services/eventService';
import { QRCodeModal } from '../components/QRCodeModal';
import { buildGuestEventUrl } from '../utils/domain';

interface OrganizerDashboardProps {
  onNavigate: (path: string) => void;
}

export const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({ onNavigate }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedQrEvent, setSelectedQrEvent] = useState<EventItem | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeEvents(
      user.uid,
      false,
      (items) => {
        setEvents(items);
        setLoading(false);
      },
      user.email || undefined,
      profile?.assignedEventIds
    );
    return () => unsub();
  }, [user, profile]);

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      await refreshProfile();
    } finally {
      setTimeout(() => setIsSyncing(false), 600);
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
      console.warn('Copy link failed:', e);
    }
  };

  const filtered = events.filter((ev) => {
    return (
      ev.name.toLowerCase().includes(search.toLowerCase()) ||
      ev.location.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
          <span className="text-xs uppercase tracking-widest font-semibold">
            Organizer Portal
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1B1A]">
          My Assigned Events
        </h1>
        <p className="text-xs sm:text-sm text-[#6E6D6B] mt-1">
          Access your event media galleries, share guest QR codes, and curate uploaded moments.
        </p>
      </div>

      {/* Search & Status Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#9E9B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your assigned events..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none transition-colors"
          />
        </div>

        <div className="flex items-center space-x-3 text-xs text-[#6E6D6B]">
          <span>
            Assigned to: <strong className="text-[#1C1B1A]">{events.length}</strong> events
          </span>
          <button
            onClick={handleRefresh}
            disabled={isSyncing}
            title="Sync and refresh assigned events"
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-[#DDD7CB] hover:border-[#1C1B1A] text-[#1C1B1A] bg-white transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 text-[#9E7D46] ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Events List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-[#E8E3D8] h-72 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E3D8] p-12 text-center my-6">
          <Calendar className="w-10 h-10 text-[#9E7D46] mx-auto mb-3" />
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-1">
            No Events Assigned
          </h3>
          <p className="text-xs text-[#7A7875] max-w-sm mx-auto mb-4">
            You currently have no events assigned to your organizer account. Please ask the Super Administrator to assign you to an event.
          </p>
          <button
            onClick={handleRefresh}
            disabled={isSyncing}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3.5 h-3.5 text-[#D8C7A5] ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Check & Sync Assigned Events</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((ev) => {
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

                  {/* Actions */}
                  <button
                    onClick={() => onNavigate(`/organizer/events/${ev.id}`)}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold text-center transition-colors flex items-center justify-center space-x-1.5 shadow-xs"
                  >
                    <span>Manage Event & View Media</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#D8C7A5]" />
                  </button>
                </div>
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
