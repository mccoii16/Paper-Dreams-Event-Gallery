import React, { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Shield,
  Trash2,
  Calendar,
  AlertCircle,
  Check,
  X,
  Search,
  Copy,
  Share2,
  Key,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserProfile, EventItem, UserStatus } from '../types';
import {
  fetchOrganizers,
  createOrganizer,
  updateOrganizerStatus,
  deleteOrganizer,
  setOrganizerEventAssignments,
} from '../services/userService';
import { subscribeEvents } from '../services/eventService';

interface OrganizerManagementPageProps {
  onNavigate: (path: string) => void;
}

export const OrganizerManagementPage: React.FC<OrganizerManagementPageProps> = ({ onNavigate }) => {
  const { user, isAdmin } = useAuth();
  const [organizers, setOrganizers] = useState<UserProfile[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAssignedEvents, setNewAssignedEvents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Credentials / Invitation Share Modal State
  const [credentialsModalInfo, setCredentialsModalInfo] = useState<{
    name: string;
    email: string;
    password?: string;
    eventNames: string[];
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Assign Modal State
  const [editingOrganizer, setEditingOrganizer] = useState<UserProfile | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  // Delete Confirm State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const orgList = await fetchOrganizers();
      setOrganizers(orgList);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to fetch organizers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !isAdmin) return;
    loadData();

    const unsubEvents = subscribeEvents(user.uid, true, (items) => {
      setEvents(items);
    });

    return () => unsubEvents();
  }, [user, isAdmin]);

  const handleCreateOrganizer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    try {
      setSubmitting(true);
      setActionError(null);
      await createOrganizer({
        name: newName,
        email: newEmail,
        password: newPassword.trim() || undefined,
        assignedEventIds: newAssignedEvents,
      });

      const assignedNames = events
        .filter((ev) => newAssignedEvents.includes(ev.id))
        .map((ev) => ev.name);

      setCredentialsModalInfo({
        name: newName,
        email: newEmail,
        password: newPassword.trim() || undefined,
        eventNames: assignedNames,
      });

      setIsCreateOpen(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewAssignedEvents([]);
      await loadData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not create organizer profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (org: UserProfile) => {
    const nextStatus: UserStatus = org.status === 'active' ? 'disabled' : 'active';
    try {
      setActionError(null);
      await updateOrganizerStatus(org.uid, nextStatus);
      setOrganizers((prev) =>
        prev.map((o) => (o.uid === org.uid ? { ...o, status: nextStatus } : o))
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update organizer status.');
    }
  };

  const handleDelete = async (uid: string) => {
    try {
      setActionError(null);
      await deleteOrganizer(uid);
      setOrganizers((prev) => prev.filter((o) => o.uid !== uid));
      setDeletingId(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete organizer.');
    }
  };

  const handleSaveAssignments = async () => {
    if (!editingOrganizer) return;
    try {
      setSubmitting(true);
      setActionError(null);
      await setOrganizerEventAssignments(
        editingOrganizer.uid,
        selectedEventIds,
        editingOrganizer.assignedEventIds || [],
        editingOrganizer.email
      );
      setOrganizers((prev) =>
        prev.map((o) =>
          o.uid === editingOrganizer.uid ? { ...o, assignedEventIds: selectedEventIds } : o
        )
      );
      setEditingOrganizer(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to save event assignments.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOrganizers = organizers.filter((org) => {
    return (
      org.name.toLowerCase().includes(search.toLowerCase()) ||
      org.email.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
            <Shield className="w-4 h-4 text-[#9E7D46]" />
            <span className="text-xs uppercase tracking-widest font-semibold">
              Access Control & Roles
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1C1B1A]">
            Organizer Accounts
          </h1>
          <p className="text-xs sm:text-sm text-[#6E6D6B] mt-1">
            Create organizer credentials, manage active account permissions, and assign events.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center space-x-1.5 py-2.5 px-4 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-xs font-semibold text-white shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-[#D8C7A5]" />
          <span>Provision Organizer</span>
        </button>
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

      {/* Search and Summary */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#9E9B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organizers by name or email..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none transition-colors"
          />
        </div>

        <div className="text-xs text-[#6E6D6B] self-end sm:self-auto">
          Total Organizers: <strong className="text-[#1C1B1A]">{organizers.length}</strong>
        </div>
      </div>

      {/* Organizers List / Cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-[#E8E3D8] h-20 animate-pulse" />
          ))}
        </div>
      ) : filteredOrganizers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E8E3D8] p-12 text-center my-6">
          <Users className="w-10 h-10 text-[#9E7D46] mx-auto mb-3" />
          <h3 className="text-base font-serif font-bold text-[#1C1B1A] mb-1">
            No Organizers Found
          </h3>
          <p className="text-xs text-[#7A7875] max-w-sm mx-auto mb-5">
            You are currently the only active administrator. Provision organizer accounts to delegate photo review and QR code downloads.
          </p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#1C1B1A] text-white text-xs font-semibold shadow-sm"
          >
            <Plus className="w-4 h-4 text-[#D8C7A5]" />
            <span>Provision First Organizer</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredOrganizers.map((org) => {
            const assignedCount = org.assignedEventIds?.length || 0;
            const assignedEventNames = events
              .filter((e) => org.assignedEventIds?.includes(e.id))
              .map((e) => e.name);

            return (
              <div
                key={org.uid}
                className="bg-white rounded-2xl border border-[#E8E3D8] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs hover:border-[#D5CEBF] transition-all"
              >
                {/* Identity info */}
                <div className="flex items-start space-x-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF9F5] border border-[#E2DDD3] flex items-center justify-center text-[#1C1B1A] font-serif font-bold text-sm shrink-0">
                    {org.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-semibold text-[#1C1B1A]">{org.name}</h4>
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                          org.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-zinc-100 text-zinc-600 border border-zinc-300'
                        }`}
                      >
                        {org.status}
                      </span>
                      {org.initialPassword || org.authMethod === 'password' ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <Key className="w-2.5 h-2.5 text-amber-600" />
                          <span>Password Access</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <span>Google Sign-In</span>
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#7A7875] mt-0.5">{org.email}</div>

                    {/* Assigned events badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] uppercase font-semibold text-[#9E7D46]">
                        Assigned ({assignedCount}):
                      </span>
                      {assignedEventNames.length === 0 ? (
                        <span className="text-[11px] text-[#A3A09A] italic">No events assigned</span>
                      ) : (
                        assignedEventNames.map((name, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-[#FAF9F5] border border-[#E8E3D8] text-[#4A4947]"
                          >
                            {name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 self-end md:self-auto pt-2 md:pt-0 border-t md:border-t-0 border-[#F2EEE4]">
                  <button
                    onClick={() => {
                      const assignedNames = events
                        .filter((ev) => (org.assignedEventIds || []).includes(ev.id))
                        .map((ev) => ev.name);
                      setCredentialsModalInfo({
                        name: org.name,
                        email: org.email,
                        password: org.initialPassword,
                        eventNames: assignedNames,
                      });
                    }}
                    className="py-1.5 px-3 rounded-lg bg-[#FAF9F5] border border-[#DDD7CB] hover:bg-[#F2EEE4] text-xs font-semibold text-[#1C1B1A] transition-colors flex items-center space-x-1.5"
                    title="Share login credentials & instructions"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#9E7D46]" />
                    <span>Share Credentials</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingOrganizer(org);
                      setSelectedEventIds(org.assignedEventIds || []);
                    }}
                    className="py-1.5 px-3 rounded-lg bg-[#FAF9F5] border border-[#DDD7CB] hover:bg-[#F2EEE4] text-xs font-semibold text-[#1C1B1A] transition-colors"
                  >
                    Edit Assignments
                  </button>

                  <button
                    onClick={() => handleToggleStatus(org)}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                      org.status === 'active'
                        ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {org.status === 'active' ? 'Disable Account' : 'Activate Account'}
                  </button>

                  <button
                    onClick={() => setDeletingId(org.uid)}
                    className="p-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                    title="Revoke access and delete account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Delete Confirmation Overlay */}
                {deletingId === org.uid && (
                  <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-[#E8E3D8] shadow-xl text-center">
                      <Trash2 className="w-8 h-8 text-red-600 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-[#1C1B1A]">Delete Organizer Account?</h4>
                      <p className="text-xs text-[#7A7875] mt-1 mb-4">
                        Are you sure you want to delete {org.name} ({org.email})? This revokes access immediately.
                      </p>
                      <div className="flex items-center justify-center space-x-3">
                        <button
                          onClick={() => handleDelete(org.uid)}
                          className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700"
                        >
                          Revoke & Delete
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
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
          })}
        </div>
      )}

      {/* Create Organizer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E3D8] rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 p-2 text-[#7A7875] hover:text-[#1C1B1A] rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs uppercase tracking-widest font-semibold">
                Super Admin Provisioning
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#1C1B1A] mb-1">
              New Organizer Account
            </h3>
            <p className="text-xs text-[#6E6D6B] mb-5">
              Organizers can sign in with their email, access only assigned events, and download guest media.
            </p>

            <form onSubmit={handleCreateOrganizer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Eleanor Vance"
                  className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="organizer@weddingevents.com"
                  className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#4A4947]">
                    Initial Password (Optional)
                  </label>
                  <span className="text-[10px] text-[#8C8983]">
                    Leave blank for Google Sign-In
                  </span>
                </div>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="e.g. Event2026! (or leave blank for Google)"
                  className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] rounded-xl text-xs text-[#1C1B1A] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4947] mb-1">
                  Assign to Events
                </label>
                <div className="max-h-40 overflow-y-auto p-2 bg-[#FAF9F5] border border-[#DDD7CB] rounded-xl space-y-1.5">
                  {events.length === 0 ? (
                    <div className="text-xs text-[#A3A09A] p-2">No events created yet.</div>
                  ) : (
                    events.map((ev) => {
                      const isChecked = newAssignedEvents.includes(ev.id);
                      return (
                        <label
                          key={ev.id}
                          className="flex items-center space-x-2 text-xs text-[#4A4947] cursor-pointer hover:bg-white p-1.5 rounded-lg transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setNewAssignedEvents((prev) => prev.filter((id) => id !== ev.id));
                              } else {
                                setNewAssignedEvents((prev) => [...prev, ev.id]);
                              }
                            }}
                            className="rounded text-[#1C1B1A] focus:ring-0"
                          />
                          <span className="truncate">{ev.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-xs font-semibold text-[#1C1B1A]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-5 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-xs font-semibold text-white shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Assignments Modal */}
      {editingOrganizer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E3D8] rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setEditingOrganizer(null)}
              className="absolute top-4 right-4 p-2 text-[#7A7875] hover:text-[#1C1B1A] rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-serif font-bold text-[#1C1B1A] mb-1">
              Event Assignments
            </h3>
            <p className="text-xs text-[#6E6D6B] mb-4">
              Select which events {editingOrganizer.name} can manage.
            </p>

            <div className="max-h-60 overflow-y-auto p-2 bg-[#FAF9F5] border border-[#DDD7CB] rounded-xl space-y-1.5 mb-5">
              {events.map((ev) => {
                const isChecked = selectedEventIds.includes(ev.id);
                return (
                  <label
                    key={ev.id}
                    className="flex items-center space-x-2 text-xs text-[#4A4947] cursor-pointer hover:bg-white p-2 rounded-lg transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setSelectedEventIds((prev) => prev.filter((id) => id !== ev.id));
                        } else {
                          setSelectedEventIds((prev) => [...prev, ev.id]);
                        }
                      }}
                      className="rounded text-[#1C1B1A] focus:ring-0"
                    />
                    <div className="truncate flex-1">
                      <div className="font-semibold text-[#1C1B1A] truncate">{ev.name}</div>
                      <div className="text-[10px] text-[#7A7875]">{ev.date || 'No date'}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setEditingOrganizer(null)}
                className="py-2.5 px-4 rounded-xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-xs font-semibold text-[#1C1B1A]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={submitting}
                className="py-2.5 px-5 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-xs font-semibold text-white shadow-xs disabled:opacity-50"
              >
                {submitting ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials & Invitation Share Modal */}
      {credentialsModalInfo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8E3D8] rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl relative">
            <button
              onClick={() => {
                setCredentialsModalInfo(null);
                setCopiedInvite(false);
              }}
              className="absolute top-4 right-4 p-2 text-[#7A7875] hover:text-[#1C1B1A] rounded-full"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 text-[#9E7D46] mb-1">
              <Key className="w-4 h-4" />
              <span className="text-xs uppercase tracking-widest font-semibold">
                Organizer Access Hand-off
              </span>
            </div>
            <h3 className="text-xl font-serif font-bold text-[#1C1B1A] mb-1">
              Organizer Login Credentials
            </h3>
            <p className="text-xs text-[#6E6D6B] mb-5">
              Copy this ready-to-send invitation to give {credentialsModalInfo.name} immediate access to their assigned events.
            </p>

            <div className="bg-[#FAF9F5] border border-[#DDD7CB] rounded-2xl p-4 space-y-3 mb-5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D5]">
                <span className="text-[#7A7875]">Organizer:</span>
                <strong className="text-[#1C1B1A] font-semibold">{credentialsModalInfo.name}</strong>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D5]">
                <span className="text-[#7A7875]">Login Email:</span>
                <span className="font-mono text-[#1C1B1A]">{credentialsModalInfo.email}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D5]">
                <span className="text-[#7A7875]">Authentication:</span>
                <span className="font-medium text-[#1C1B1A]">
                  {credentialsModalInfo.password ? (
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-[#DDD7CB]">
                      Password: {credentialsModalInfo.password}
                    </span>
                  ) : (
                    'Google Sign-In ("Continue with Google")'
                  )}
                </span>
              </div>
              <div className="flex items-start justify-between pb-2 border-b border-[#E8E2D5]">
                <span className="text-[#7A7875] shrink-0">Assigned Events:</span>
                <span className="text-right font-medium text-[#1C1B1A] max-w-[260px]">
                  {credentialsModalInfo.eventNames.length > 0
                    ? credentialsModalInfo.eventNames.join(', ')
                    : 'All assigned events (update anytime)'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[#7A7875]">Login URL:</span>
                <span className="font-mono text-[11px] text-[#9E7D46] underline truncate max-w-[250px]">
                  {window.location.origin}/login
                </span>
              </div>
            </div>

            {/* Quick copy actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={async () => {
                  const portalUrl = `${window.location.origin}/login`;
                  const inviteText = [
                    `PaperDreams LUXE - Organizer Access`,
                    `Hi ${credentialsModalInfo.name},`,
                    ``,
                    `You've been granted Organizer access to manage event photos and QR codes:`,
                    `Events: ${credentialsModalInfo.eventNames.join(', ') || 'Assigned events'}`,
                    ``,
                    `Login Portal: ${portalUrl}`,
                    `Login Email: ${credentialsModalInfo.email}`,
                    credentialsModalInfo.password
                      ? `Temporary Password: ${credentialsModalInfo.password}`
                      : `Sign-in method: Click "Continue with Google" using this email address.`,
                    ``,
                    `Once logged in, you can review guest uploads in real-time and download the high-res QR code.`,
                  ].join('\n');

                  try {
                    await navigator.clipboard.writeText(inviteText);
                    setCopiedInvite(true);
                    setTimeout(() => setCopiedInvite(false), 2500);
                  } catch (e) {
                    console.warn('Copy failed:', e);
                  }
                }}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {copiedInvite ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied Invitation to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#D8C7A5]" />
                    <span>Copy Full Invitation & Credentials</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setCredentialsModalInfo(null);
                  setCopiedInvite(false);
                }}
                className="w-full sm:w-auto py-3 px-5 rounded-xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-xs font-semibold text-[#1C1B1A] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
