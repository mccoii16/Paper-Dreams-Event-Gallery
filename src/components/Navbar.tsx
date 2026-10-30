import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Users, Plus, LogOut, Calendar } from 'lucide-react';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, onNavigate }) => {
  const { user, profile, isAdmin, isOrganizer, logout } = useAuth();

  if (!user) {
    return (
      <header className="w-full bg-[#FAF9F5]/90 backdrop-blur-md border-b border-[#E8E3D8] sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => onNavigate('/login')}
            className="flex items-center space-x-2.5 text-left group"
          >
            <img
              src="/assets/aistudio/logo2_606d60c8.png"
              alt="PaperDreams Logo"
              className="w-9 h-9 object-contain rounded-full shadow-xs group-hover:scale-105 transition-transform"
            />
            <div>
              <span className="text-base font-serif font-bold tracking-tight text-[#1C1B1A]">
                PaperDreams
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#9E7D46] ml-1.5 font-semibold">
                LUXE
              </span>
            </div>
          </button>

          <button
            onClick={() => onNavigate('/login')}
            className="text-xs font-semibold px-4 py-2 rounded-xl bg-[#1C1B1A] text-white hover:bg-[#333230] transition-colors"
          >
            Sign In
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="w-full bg-[#FAF9F5]/90 backdrop-blur-md border-b border-[#E8E3D8] sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <button
            onClick={() => onNavigate(isAdmin ? '/admin' : '/organizer')}
            className="flex items-center space-x-2.5 text-left group"
          >
            <img
              src="/assets/aistudio/logo2_606d60c8.png"
              alt="PaperDreams Logo"
              className="w-9 h-9 object-contain rounded-full shadow-xs group-hover:scale-105 transition-transform"
            />
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-base font-serif font-bold tracking-tight text-[#1C1B1A]">
                  PaperDreams
                </span>
                <span className="text-[10px] uppercase tracking-widest text-[#9E7D46] font-semibold">
                  LUXE
                </span>
              </div>
            </div>
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center space-x-1 text-xs font-medium">
            {isAdmin && (
              <>
                <button
                  onClick={() => onNavigate('/admin')}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
                    currentPath === '/admin'
                      ? 'bg-[#EAE5D8] text-[#1C1B1A] font-semibold'
                      : 'text-[#6E6D6B] hover:text-[#1C1B1A] hover:bg-[#F2EEE4]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>All Events</span>
                </button>

                <button
                  onClick={() => onNavigate('/admin/organizers')}
                  className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
                    currentPath === '/admin/organizers'
                      ? 'bg-[#EAE5D8] text-[#1C1B1A] font-semibold'
                      : 'text-[#6E6D6B] hover:text-[#1C1B1A] hover:bg-[#F2EEE4]'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Organizers</span>
                </button>
              </>
            )}

            {!isAdmin && isOrganizer && (
              <button
                onClick={() => onNavigate('/organizer')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center space-x-1.5 ${
                  currentPath === '/organizer'
                    ? 'bg-[#EAE5D8] text-[#1C1B1A] font-semibold'
                    : 'text-[#6E6D6B] hover:text-[#1C1B1A] hover:bg-[#F2EEE4]'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>My Events</span>
              </button>
            )}
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center space-x-3">
          {isAdmin && (
            <button
              onClick={() => onNavigate('/admin/events/new')}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#1C1B1A] text-white hover:bg-[#333230] text-xs font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-[#D8C7A5]" />
              <span>New Event</span>
            </button>
          )}

          {/* User badge */}
          <div className="flex items-center space-x-2 pl-2 border-l border-[#E5E0D5]">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-[#1C1B1A] max-w-[140px] truncate">
                {profile?.name || user.displayName || user.email}
              </div>
              <div className="text-[10px] flex items-center justify-end space-x-1 text-[#9E7D46] font-semibold uppercase tracking-wider">
                {isAdmin ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-[#9E7D46]" />
                    <span>Super Admin</span>
                  </>
                ) : (
                  <span>Organizer</span>
                )}
              </div>
            </div>

            <button
              onClick={() => logout()}
              title="Sign Out"
              aria-label="Sign out"
              className="p-2 rounded-lg text-[#7A7875] hover:text-[#1C1B1A] hover:bg-[#EAE5D8] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
