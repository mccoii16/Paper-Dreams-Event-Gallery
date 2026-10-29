/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { LoginPage } from './pages/LoginPage';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { OrganizerManagementPage } from './pages/OrganizerManagementPage';
import { EventCreatePage } from './pages/EventCreatePage';
import { EventDetailPage } from './pages/EventDetailPage';
import { OrganizerDashboard } from './pages/OrganizerDashboard';
import { GuestEventPage } from './pages/GuestEventPage';
import { Sparkles, Calendar, Camera } from 'lucide-react';
import { createEvent, DEFAULT_BANNERS } from './services/eventService';

function AppContent() {
  const { user, profile, isAdmin, isOrganizer, loading } = useAuth();
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 1. Guest Upload Flow: /e/:publicToken (No login required, completely isolated)
  const guestMatch = currentPath.match(/^\/e\/([a-zA-Z0-9_-]+)/);
  if (guestMatch) {
    const publicToken = guestMatch[1];
    return <GuestEventPage publicToken={publicToken} />;
  }

  // 2. Loading Auth State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-2 border-[#9E7D46] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-serif text-[#7A7875]">Verifying secure session...</p>
      </div>
    );
  }

  // 3. Routing Switcher
  const renderRoute = () => {
    // If not authenticated, always show Login page unless already on /login
    if (!user) {
      return (
        <LoginPage
          onSuccess={(rolePath) => {
            navigate(rolePath);
          }}
        />
      );
    }

    // Admin Routes
    if (currentPath === '/admin' || (currentPath === '/' && isAdmin)) {
      if (!isAdmin) {
        return <OrganizerDashboard onNavigate={navigate} />;
      }
      return <SuperAdminDashboard onNavigate={navigate} />;
    }

    if (currentPath === '/admin/organizers') {
      if (!isAdmin) return <OrganizerDashboard onNavigate={navigate} />;
      return <OrganizerManagementPage onNavigate={navigate} />;
    }

    if (currentPath === '/admin/events/new') {
      if (!isAdmin) return <OrganizerDashboard onNavigate={navigate} />;
      return <EventCreatePage onNavigate={navigate} />;
    }

    const adminEventMatch = currentPath.match(/^\/admin\/events\/([a-zA-Z0-9_-]+)/);
    if (adminEventMatch) {
      return <EventDetailPage eventId={adminEventMatch[1]} onNavigate={navigate} />;
    }

    // Organizer Routes
    if (currentPath === '/organizer' || (currentPath === '/' && !isAdmin && isOrganizer)) {
      return <OrganizerDashboard onNavigate={navigate} />;
    }

    const orgEventMatch = currentPath.match(/^\/organizer\/events\/([a-zA-Z0-9_-]+)/);
    if (orgEventMatch) {
      return <EventDetailPage eventId={orgEventMatch[1]} onNavigate={navigate} />;
    }

    // Login page when already signed in
    if (currentPath === '/login') {
      return (
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#1C1B1A] text-[#FAF9F5] flex items-center justify-center mx-auto mb-4">
            <Camera className="w-6 h-6 text-[#D8C7A5]" />
          </div>
          <h2 className="text-xl font-serif font-bold text-[#1C1B1A] mb-2">
            Already Signed In
          </h2>
          <p className="text-xs text-[#7A7875] mb-6">
            Signed in as {profile?.name || user.email} ({isAdmin ? 'Super Admin' : 'Organizer'})
          </p>
          <button
            onClick={() => navigate(isAdmin ? '/admin' : '/organizer')}
            className="py-2.5 px-6 rounded-xl bg-[#1C1B1A] text-white text-xs font-semibold"
          >
            Go to {isAdmin ? 'Admin Dashboard' : 'Organizer Portal'}
          </button>
        </div>
      );
    }

    // Fallback: route based on role
    return isAdmin ? (
      <SuperAdminDashboard onNavigate={navigate} />
    ) : (
      <OrganizerDashboard onNavigate={navigate} />
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col selection:bg-[#E2DDD3]">
      <Navbar currentPath={currentPath} onNavigate={navigate} />
      <main className="flex-1 pb-16 md:pb-8">{renderRoute()}</main>
      <MobileBottomNav currentPath={currentPath} onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
