"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
  /**
   * False until the stored preference has been read on the client. Used to
   * avoid rendering theme-dependent UI that would otherwise flash.
   */
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggle: () => {},
  setTheme: () => {},
  mounted: false,
});

const STORAGE_KEY = "savora-theme";

/**
 * A same-tab notification channel.
 *
 * `localStorage`'s own `storage` event only fires in *other* tabs, so a tab that
 * changes the theme would never learn about it. This event closes that gap.
 */
const CHANGE_EVENT = "savora-theme-change";

/**
 * The theme, read straight from the browser rather than mirrored into React
 * state.
 *
 * The obvious implementation is `useState` plus an effect that reads
 * `localStorage` on mount and calls `setState`. It works, and it is wrong in two
 * ways: the first client render disagrees with the server's, and the correction
 * lands in a second render — which is precisely the flash the inline script in
 * the root layout was added to prevent. `useSyncExternalStore` is the API built
 * for exactly this shape of problem: `getServerSnapshot` supplies the value used
 * for the server render and hydration, and the browser's answer takes over the
 * moment hydration finishes, with no extra render in between.
 */
function subscribe(onStoreChange: () => void) {
  // Fires in every *other* tab that writes the preference.
  window.addEventListener("storage", onStoreChange);
  // Fires in this tab, from `setTheme` below.
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  // Fires when the OS preference changes and the visitor has not overridden it.
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The server has no idea what the visitor chose; cream is the light default. */
function getServerSnapshot(): Theme {
  return "light";
}

/**
 * False during the server render and hydration, true from the first commit after
 * it. The trick is a store whose snapshot is a constant `true` on the client and
 * a constant `false` on the server: `useSyncExternalStore` already knows when it
 * is hydrating, so this needs no state of its own.
 */
const noopSubscribe = () => () => {};
function useIsHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  // Keeps native form controls, scrollbars and the canvas background in step.
  root.style.colorScheme = next;
}

/**
 * Theme provider.
 *
 * The initial class is applied by an inline script in the root layout (see
 * `layout.tsx`) so the page never flashes the wrong palette. This provider's job
 * is only to keep React in step with what that script did, and to persist a
 * choice when one is made.
 *
 * `mounted` exists because the server has no idea what the visitor chose. Any
 * component that renders differently per theme (the toggle icon, for one) uses
 * it to render a stable placeholder on first paint rather than guessing.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const mounted = useIsHydrated();

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing can reject writes; the session still works, it just
      // will not be remembered next time.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme, mounted }),
    [theme, toggle, setTheme, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
