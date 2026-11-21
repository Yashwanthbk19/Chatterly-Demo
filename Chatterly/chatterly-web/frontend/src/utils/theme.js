// The dark theme is a class on <html> (see index.css), but only ChatListPage
// owns the preference state. Pre-chat routes — login, OTP, profile setup — render
// without it, so on a full page load they would always paint in light mode.
// Applying the stored preference at boot keeps those pages in the right theme.
export const THEME_PREFERENCE_STORAGE_KEY = 'chatterly_theme_preference';

const THEME_PREFERENCES = ['light', 'dark', 'system'];

export const readStoredThemePreference = () => {
  try {
    const storedPreference = localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
    return THEME_PREFERENCES.includes(storedPreference) ? storedPreference : 'light';
  } catch (error) {
    return 'light';
  }
};

export const isDarkThemePreference = (preference) =>
  preference === 'dark' ||
  (preference === 'system' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);

export const applyThemeToDocument = (isDark) => {
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  document.documentElement.classList.toggle('chatterly-theme-dark', isDark);
};

export const applyStoredTheme = () => {
  const preference = readStoredThemePreference();
  applyThemeToDocument(isDarkThemePreference(preference));
  return preference;
};
