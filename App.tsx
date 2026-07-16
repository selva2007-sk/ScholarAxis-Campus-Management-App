
import React, { useState, useCallback, useEffect } from 'react';
// Capacitor status bar helper (optional at runtime)
import { StatusBar } from '@capacitor/status-bar';
import { User, UserRole } from './types';
import SplashScreen from './components/SplashScreen';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import StaffDashboard from './pages/StaffDashboard';
import AdminDashboard from './pages/AdminDashboard';
import NotificationToast, { NotificationType } from './components/NotificationToast';
import { initPushNotifications, removeStoredPushToken } from './src/pushNotifications';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        StatusBar?: {
          setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void> | void;
        };
      };
    };
    StatusBar?: {
      overlaysWebView?: (overlay: boolean) => void;
    };
    ReactNativeWebView?: unknown;
  }
}

const configureNativeStatusBar = async () => {
  // Keep web content below the native status bar so header can stay at top: 0.
  const isNative = window.Capacitor?.isNativePlatform?.() ?? false;
  if (!isNative) return;

  // Try Capacitor StatusBar plugin via direct import first.
  try {
    try {
      if (StatusBar && typeof StatusBar.setOverlaysWebView === 'function') {
        await StatusBar.setOverlaysWebView({ overlay: false });
      }
    } catch {
      // ignore
    }

    // Runtime plugin fallback when exposed on window.
    if (window.Capacitor?.Plugins?.StatusBar?.setOverlaysWebView) {
      await window.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: false });
    }
  } catch {
    // ignore plugin failures
  }

  // Cordova / legacy fallback.
  if (window.StatusBar?.overlaysWebView) {
    try { window.StatusBar.overlaysWebView(false); } catch {}
  }
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  const notify = useCallback((message: string, type: NotificationType = 'info') => {
    setNotification({ message, type });
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    configureNativeStatusBar().catch(() => {
      // Safe fallback for web/PWA or wrappers without status-bar plugin support.
    });

    const timer = setTimeout(() => {
      setLoading(false);
      const savedUser = localStorage.getItem('logged_user');
      if (savedUser) {
        try {
          setCurrentUser(JSON.parse(savedUser));
        } catch {
          localStorage.removeItem('logged_user');
        }
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Measure header/main to set CSS variables used by global fixed-header layout.
  useEffect(() => {
    const root = document.documentElement;
    let resizeObserver: ResizeObserver | null = null;
    let rafId = 0;

    const updateSafeTopFromCSS = () => {
      try {
        const test = document.createElement('div');
        test.style.cssText =
          'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);padding-top:constant(safe-area-inset-top);';
        document.body.appendChild(test);
        const val = getComputedStyle(test).paddingTop || '';
        document.body.removeChild(test);
        const safeTop = parseFloat(val) || 0;
        root.style.setProperty('--app-safe-top', `${safeTop}px`);
      } catch {
        root.style.setProperty('--app-safe-top', '0px');
      }
    };

    const updateMeasurements = () => {
      updateSafeTopFromCSS();

      const main = document.querySelector('main');
      const header = document.querySelector('main header.app-header') || document.querySelector('header.app-header');
      const headerHeight = header ? Math.ceil((header as HTMLElement).getBoundingClientRect().height) : 0;

      if (main) {
        const rect = (main as HTMLElement).getBoundingClientRect();
        const left = Math.max(0, Math.floor(rect.left));
        const right = Math.max(0, Math.floor(window.innerWidth - rect.right));
        root.style.setProperty('--app-main-left', `${left}px`);
        root.style.setProperty('--app-main-right', `${right}px`);
      } else {
        root.style.setProperty('--app-main-left', '0px');
        root.style.setProperty('--app-main-right', '0px');
      }

      root.style.setProperty('--app-header-height', `${headerHeight}px`);
      root.style.setProperty('--app-header-total', `${headerHeight}px`);

      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (header && typeof window.ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateMeasurements);
        resizeObserver.observe(header);
      }
    };

    // Wait one frame so the current screen's header is mounted before measuring.
    rafId = window.requestAnimationFrame(updateMeasurements);
    window.addEventListener('resize', updateMeasurements);
    window.addEventListener('orientationchange', updateMeasurements);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateMeasurements);
      window.removeEventListener('orientationchange', updateMeasurements);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [loading, currentUser]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('logged_user', JSON.stringify(user));
    notify(`Welcome back, ${user.name}!`, 'success');
  };

  const handleLogout = () => {
    if (currentUser) {
      void removeStoredPushToken(currentUser.id);
    }
    setCurrentUser(null);
    localStorage.removeItem('logged_user');
    notify("Logged out successfully.", "info");
  };

  useEffect(() => {
    if (!currentUser) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      const dispose = await initPushNotifications({
        userId: currentUser.id,
        onForegroundNotification: notification => {
          const title = notification.title ? `${notification.title}: ` : '';
          const body = notification.body || '';
          if (title || body) {
            notify(`${title}${body}`, 'info');
          }
        }
      });

      if (cancelled) {
        dispose();
        return;
      }
      cleanup = dispose;
    };

    void setup();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [currentUser, notify]);

  if (loading) return <SplashScreen />;

  const dashboardProps = {
    user: currentUser!,
    onLogout: handleLogout,
    toggleTheme,
    theme,
    notify
  };

  return (
    <>
      {!currentUser ? (
        <Login onLogin={handleLogin} toggleTheme={toggleTheme} theme={theme} notify={notify} />
      ) : (
        <>
          {currentUser.role === UserRole.STUDENT && <StudentDashboard {...dashboardProps} />}
          {currentUser.role === UserRole.ADMIN && <AdminDashboard {...dashboardProps} />}
          {(currentUser.role === UserRole.TUTOR || currentUser.role === UserRole.COORDINATOR || currentUser.role === UserRole.HOD) && (
            <StaffDashboard {...dashboardProps} />
          )}
        </>
      )}
      {notification && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </>
  );
};

export default App;
