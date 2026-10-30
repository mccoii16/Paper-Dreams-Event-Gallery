import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, googleProvider, SUPERADMIN_EMAIL, testConnection } from '../firebase/config';
import { initAppCheck } from '../firebase/appCheck';
import { UserProfile, UserRole } from '../types';
import { handleFirestoreError, OperationType } from '../firebase/errors';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  isOrganizer: boolean;
  loading: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    testConnection();
    initAppCheck();
  }, []);

  const loadUserProfile = async (firebaseUser: User) => {
    try {
      const isSuperAdminEmail =
        firebaseUser.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();

      // Invoke server-controlled bootstrap to set custom claims and establish /admins doc
      if (isSuperAdminEmail) {
        try {
          const idToken = await firebaseUser.getIdToken();
          await fetch('/api/admin/bootstrap', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
          });
        } catch (e) {
          console.warn('Server admin bootstrap endpoint note:', e);
        }
      }

      // Invoke server-controlled sync to associate any pre-created events or profile
      try {
        const idToken = await firebaseUser.getIdToken();
        const syncRes = await fetch('/api/organizer/sync', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (syncRes.ok) {
          const syncData = await syncRes.json();
          if (syncData.profile) {
            if (syncData.profile.status === 'disabled') {
              setError('This account has been disabled by the administrator.');
              await signOut(auth);
              setUser(null);
              setProfile(null);
              return;
            }
            setProfile(syncData.profile);
            return;
          }
        }
      } catch (syncErr) {
        console.warn('API sync endpoint notice, proceeding to client Firestore resolution:', syncErr);
      }

      // Check users collection
      const cleanEmail = firebaseUser.email?.toLowerCase().trim() || '';
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      // Check if an organizer profile was pre-created by Super Admin with matching email
      let preCreatedProfile: UserProfile | null = null;
      if (cleanEmail) {
        try {
          const orgQuery = query(collection(db, 'users'), where('email', '==', cleanEmail));
          const orgSnap = await getDocs(orgQuery);
          for (const d of orgSnap.docs) {
            if (d.id !== firebaseUser.uid) {
              const dData = d.data() as UserProfile;
              if (!preCreatedProfile) {
                preCreatedProfile = dData;
              } else if (Array.isArray(dData.assignedEventIds)) {
                preCreatedProfile.assignedEventIds = Array.from(
                  new Set([...(preCreatedProfile.assignedEventIds || []), ...dData.assignedEventIds])
                );
              }
            }
          }
        } catch (lookupErr) {
          console.warn('Pre-created organizer lookup notice:', lookupErr);
        }
      }

      // Check events where organizerEmails contains cleanEmail
      let emailAssignedEventIds: string[] = [];
      if (cleanEmail) {
        try {
          const evQuery = query(collection(db, 'events'), where('organizerEmails', 'array-contains', cleanEmail));
          const evSnap = await getDocs(evQuery);
          for (const evDoc of evSnap.docs) {
            emailAssignedEventIds.push(evDoc.id);
            const evData = evDoc.data();
            const orgIds: string[] = Array.isArray(evData.organizerIds) ? evData.organizerIds : [];
            if (!orgIds.includes(firebaseUser.uid)) {
              updateDoc(doc(db, 'events', evDoc.id), {
                organizerIds: arrayUnion(firebaseUser.uid),
                updatedAt: new Date().toISOString(),
              }).catch(() => {});
            }
          }
        } catch {
          // Handled safely
        }
      }

      if (userSnap.exists()) {
        const data = userSnap.data() as UserProfile;
        if (data.status === 'disabled') {
          setError('This account has been disabled by the administrator.');
          await signOut(auth);
          setUser(null);
          setProfile(null);
          return;
        }

        // Merge any pre-created event assignments & email assignments if current profile is missing them
        const mergedEventIds = Array.from(
          new Set([
            ...(data.assignedEventIds || []),
            ...(preCreatedProfile?.assignedEventIds || []),
            ...emailAssignedEventIds,
          ])
        );

        const updatedProfile: UserProfile = {
          ...data,
          uid: firebaseUser.uid,
          assignedEventIds: mergedEventIds,
          updatedAt: new Date().toISOString(),
        };

        if (mergedEventIds.length !== (data.assignedEventIds?.length || 0)) {
          try {
            await setDoc(userRef, updatedProfile, { merge: true });
          } catch (writeErr) {
            console.warn('Assigned events sync write notice:', writeErr);
          }
        }
        setProfile(updatedProfile);
      } else {
        if (preCreatedProfile) {
          if (preCreatedProfile.status === 'disabled') {
            setError('This account has been disabled by the administrator.');
            await signOut(auth);
            setUser(null);
            setProfile(null);
            return;
          }
          const linkedProfile: UserProfile = {
            ...preCreatedProfile,
            uid: firebaseUser.uid,
            name: preCreatedProfile.name || firebaseUser.displayName || 'Organizer',
            email: cleanEmail,
            role: 'organizer',
            status: preCreatedProfile.status || 'active',
            assignedEventIds: Array.from(new Set([...(preCreatedProfile.assignedEventIds || []), ...emailAssignedEventIds])),
            updatedAt: new Date().toISOString(),
          };
          try {
            await setDoc(userRef, linkedProfile, { merge: true });
          } catch (writeErr) {
            console.warn('Profile link write notice:', writeErr);
          }
          setProfile(linkedProfile);
        } else {
          // Auto-provision Superadmin profile if matching email
          const role: UserRole = isSuperAdminEmail ? 'superadmin' : 'organizer';
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || (isSuperAdminEmail ? 'Super Admin' : 'Organizer'),
            role,
            status: 'active',
            assignedEventIds: emailAssignedEventIds,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          if (isSuperAdminEmail) {
            try {
              await setDoc(doc(db, 'admins', firebaseUser.uid), {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                establishedAt: new Date().toISOString(),
                bootstrappedVia: 'client_superadmin_auth',
              }, { merge: true });
            } catch (admDocErr) {
              console.warn('Admin doc creation notice:', admDocErr);
            }

            try {
              await setDoc(userRef, newProfile, { merge: true });
              setProfile(newProfile);
            } catch (writeErr) {
              console.error('Error writing superadmin profile:', writeErr);
              setProfile(newProfile);
            }
          } else {
            setProfile(newProfile);
          }
        }
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
      // Fallback for super admin email
      if (firebaseUser.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
        setProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || 'Super Admin',
          role: 'superadmin',
          status: 'active',
          assignedEventIds: [],
          createdAt: new Date().toISOString(),
        });
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadUserProfile(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      setError(null);
      setLoading(true);
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user) {
        await loadUserProfile(cred.user);
      }
    } catch (err: unknown) {
      console.error('Google Sign-in error:', err);
      const code = (err as { code?: string })?.code;
      if (code === 'auth/unauthorized-domain') {
        const domain = typeof window !== 'undefined' ? window.location.hostname : 'your domain';
        setError(
          `Domain not authorized (${domain}). Please add "${domain}" in Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else {
        const message = err instanceof Error ? err.message : 'Google sign in failed.';
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      setError(null);
      setLoading(true);
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if (cred.user) {
        await loadUserProfile(cred.user);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      let message = err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      if (code === 'auth/operation-not-allowed') {
        message = 'Email/Password sign-in is not enabled in Firebase Console. Please enable "Email/Password" in Firebase Console > Authentication > Sign-in method.';
      } else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        message = 'Invalid email or password. Please verify the credentials with your Super Admin.';
      }
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setError(null);
    } catch (err: unknown) {
      console.error('Error signing out:', err);
    }
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await loadUserProfile(auth.currentUser);
    }
  };

  const isAdmin =
    Boolean(user && (user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase() || profile?.role === 'superadmin'));

  const isOrganizer =
    Boolean(user && (profile?.role === 'organizer' || isAdmin));

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isOrganizer,
        loading,
        error,
        loginWithGoogle,
        loginWithEmail,
        logout,
        clearError: () => setError(null),
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
