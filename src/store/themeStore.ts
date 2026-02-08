import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  /** User's theme preference: 'light', 'dark', or 'system' */
  theme: Theme;
  /** Actual resolved theme based on preference + system setting */
  resolvedTheme: ResolvedTheme;

  /** Set the theme preference */
  setTheme: (theme: Theme) => void;
  /** Cycle through themes: light -> dark -> system -> light */
  cycleTheme: () => void;
  /** Initialize theme on app load and set up system preference listener */
  initializeTheme: () => () => void;
}

// Store the cleanup function for the media query listener
let mediaQueryCleanup: (() => void) | null = null;
let themeInitialized = false;

/**
 * Get the system's preferred color scheme
 */
const getSystemTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/**
 * Apply the theme to the document by toggling the 'dark' class
 */
const applyTheme = (theme: ResolvedTheme) => {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }

  // Update meta theme-color for mobile browsers
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#fafafa');
  }
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      resolvedTheme: 'dark', // Default to dark for SSR safety

      setTheme: (theme) => {
        const resolved = theme === 'system' ? getSystemTheme() : theme;
        applyTheme(resolved);
        set({ theme, resolvedTheme: resolved });
      },

      cycleTheme: () => {
        const { resolvedTheme } = get();
        // Simply toggle between light and dark
        const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
        get().setTheme(nextTheme);
      },

      initializeTheme: () => {
        const { theme } = get();
        const resolved = theme === 'system' ? getSystemTheme() : theme;
        applyTheme(resolved);
        set({ resolvedTheme: resolved });

        // Guard against double-initialization (React StrictMode double-mount)
        if (themeInitialized) {
          return () => {};
        }
        themeInitialized = true;

        // Clean up any existing listener before adding a new one
        if (mediaQueryCleanup) {
          mediaQueryCleanup();
          mediaQueryCleanup = null;
        }

        // Listen for system theme changes
        if (typeof window !== 'undefined') {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const handler = (e: MediaQueryListEvent) => {
            if (get().theme === 'system') {
              const newResolved = e.matches ? 'dark' : 'light';
              applyTheme(newResolved);
              set({ resolvedTheme: newResolved });
            }
          };
          mediaQuery.addEventListener('change', handler);

          // Store cleanup function
          mediaQueryCleanup = () => {
            mediaQuery.removeEventListener('change', handler);
          };
        }

        // Return cleanup function for callers that need it
        return () => {
          if (mediaQueryCleanup) {
            mediaQueryCleanup();
            mediaQueryCleanup = null;
          }
          themeInitialized = false;
        };
      },
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
