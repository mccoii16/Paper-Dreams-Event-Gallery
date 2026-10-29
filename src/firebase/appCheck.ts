import { initializeAppCheck, ReCaptchaEnterpriseProvider, AppCheck } from 'firebase/app-check';
import { app } from './config';
import firebaseConfig from '../../firebase-applet-config.json';

let appCheckInstance: AppCheck | null = null;

/**
 * Initializes Firebase App Check with ReCaptcha Enterprise or Debug Token.
 * Protects backend services (Firestore, Storage, Functions) from unauthorized API abuse,
 * bots, and origin spoofing.
 */
export function initAppCheck(): AppCheck | null {
  if (typeof window === 'undefined') return null;
  if (appCheckInstance) return appCheckInstance;

  try {
    const siteKey = firebaseConfig.recaptchaSiteKey;

    // Enable debug token in development mode
    if (process.env.NODE_ENV !== 'production') {
      // @ts-ignore
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    if (siteKey) {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      console.log('Firebase App Check successfully initialized with ReCaptcha Enterprise.');
    } else {
      console.info(
        'App Check Note: "recaptchaSiteKey" is not set in firebase-applet-config.json. ' +
        'To enforce App Check attestation in production, configure reCAPTCHA Enterprise in Firebase Console.'
      );
    }
  } catch (err) {
    console.warn('App Check initialization non-fatal notice:', err);
  }

  return appCheckInstance;
}
