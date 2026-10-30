import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Camera, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onSuccess: (role: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { loginWithGoogle, loginWithEmail, error, clearError, loading, isAdmin, isOrganizer } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If already authenticated, redirect
  React.useEffect(() => {
    if (isAdmin) {
      onSuccess('/admin');
    } else if (isOrganizer) {
      onSuccess('/organizer');
    }
  }, [isAdmin, isOrganizer, onSuccess]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearError();

    if (!email.trim() || !password) {
      setFormError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await loginWithEmail(email.trim(), password);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Invalid credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    clearError();
    try {
      await loginWithGoogle();
    } catch (err) {
      console.warn('Google sign in error:', err);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-[#FAF9F5]">
      <div className="w-full max-w-md bg-white border border-[#E8E3D8] rounded-3xl p-7 sm:p-9 shadow-xl relative overflow-hidden">
        {/* Subtle decorative top accent */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[#D8C7A5] via-[#9E7D46] to-[#D8C7A5]" />

        {/* Brand Header */}
        <div className="text-center mb-8">
          <img
            src="/assets/aistudio/logo2_606d60c8.png"
            alt="PaperDreams Logo"
            className="w-16 h-16 mx-auto mb-3.5 object-contain rounded-full shadow-md hover:scale-105 transition-transform"
          />
          <h2 className="text-2xl font-serif font-bold text-[#1C1B1A] tracking-tight">
            PaperDreams LUXE
          </h2>
          <p className="text-xs text-[#7A7875] mt-1 uppercase tracking-widest font-medium">
            Administrative & Organizer Portal
          </p>
        </div>

        {/* Security Notice */}
        <div className="mb-6 p-3.5 rounded-2xl bg-[#F7F5EE] border border-[#E8E2D2] flex items-start space-x-2.5 text-xs text-[#5D5B57]">
          <ShieldCheck className="w-4 h-4 text-[#9E7D46] shrink-0 mt-0.5" />
          <span>
            Guests never require an account. To upload event photos or videos, access your host's dedicated public link or QR code directly.
          </span>
        </div>

        {(error || formError) && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start space-x-2 text-xs text-red-700 animate-fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{formError || error}</span>
          </div>
        )}

        {/* Google One-Click Sign In (Primary for Superadmin) */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading || submitting}
          className="w-full flex items-center justify-center space-x-3 py-3 px-4 rounded-xl bg-[#1C1B1A] hover:bg-[#333230] text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 mb-6 cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
            />
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
            />
            <path
              fill="#FBBC05"
              d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.4C3.7 20.4 7.5 23 12 23z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex py-2 items-center mb-6">
          <div className="flex-grow border-t border-[#E8E3D8]" />
          <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-[#9E9B95] font-semibold">
            Or organizer credentials
          </span>
          <div className="flex-grow border-t border-[#E8E3D8]" />
        </div>

        {/* Email & Password Form for Created Organizers */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
              Account Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#9E9B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="organizer@event.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] focus:bg-white rounded-xl text-xs text-[#1C1B1A] outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#4A4947] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#9E9B95] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-[#FAF9F5] border border-[#DDD7CB] focus:border-[#1C1B1A] focus:bg-white rounded-xl text-xs text-[#1C1B1A] outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || submitting}
            className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-[#EBE5D8] hover:bg-[#E2DDD0] text-[#1C1B1A] text-xs font-semibold transition-all shadow-xs active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <span>{submitting ? 'Authenticating...' : 'Sign In with Email'}</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#1C1B1A]" />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#F0EBE0] text-center space-y-3">
          <a
            href="/e/demo"
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-[#9E7D46] hover:text-[#846231] hover:underline"
          >
            <span>Experience Guest Upload Flow (/e/demo)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
          <p className="text-[11px] text-[#8C8983] leading-relaxed">
            Only administrators can provision organizer accounts. Public self-registration is strictly disabled by security policy.
          </p>
        </div>
      </div>
    </div>
  );
};
