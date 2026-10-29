import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Calendar, Users, PlusCircle } from 'lucide-react';

interface MobileBottomNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ currentPath, onNavigate }) => {
  const { user, isAdmin, isOrganizer } = useAuth();

  if (!user) return null;

  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 bg-[#FAF9F5]/95 backdrop-blur-md border-t border-[#E5E0D5] z-40 px-4 py-2">
      <div className="flex items-center justify-around max-w-sm mx-auto">
        {isAdmin && (
          <>
            <button
              onClick={() => onNavigate('/admin')}
              className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium ${
                currentPath === '/admin' ? 'text-[#1C1B1A] font-bold' : 'text-[#7A7875]'
              }`}
            >
              <Calendar className="w-5 h-5 mb-0.5" />
              <span>Events</span>
            </button>

            <button
              onClick={() => onNavigate('/admin/events/new')}
              className="flex flex-col items-center -mt-5"
            >
              <div className="w-12 h-12 rounded-full bg-[#1C1B1A] text-white flex items-center justify-center shadow-lg border-2 border-[#FAF9F5]">
                <PlusCircle className="w-6 h-6 text-[#D8C7A5]" />
              </div>
              <span className="text-[10px] font-semibold text-[#1C1B1A] mt-1">Create</span>
            </button>

            <button
              onClick={() => onNavigate('/admin/organizers')}
              className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium ${
                currentPath === '/admin/organizers' ? 'text-[#1C1B1A] font-bold' : 'text-[#7A7875]'
              }`}
            >
              <Users className="w-5 h-5 mb-0.5" />
              <span>Organizers</span>
            </button>
          </>
        )}

        {!isAdmin && isOrganizer && (
          <button
            onClick={() => onNavigate('/organizer')}
            className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium ${
              currentPath === '/organizer' ? 'text-[#1C1B1A] font-bold' : 'text-[#7A7875]'
            }`}
          >
            <Calendar className="w-5 h-5 mb-0.5" />
            <span>My Events</span>
          </button>
        )}
      </div>
    </div>
  );
};
