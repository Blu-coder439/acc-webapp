export const getCurrentUser = () => {
  const savedUser = localStorage.getItem('currentUser');

  if (!savedUser) {
    return null;
  }

  try {
    return JSON.parse(savedUser);
  } catch {
    return null;
  }
};

export const getUserSettingsKey = (userId) =>
  userId ? `finflow-settings-${userId}` : 'finflow-settings-guest';

export const getUserSettings = (userId) => {
  const savedSettings = localStorage.getItem(getUserSettingsKey(userId));

  if (!savedSettings) {
    return {};
  }

  try {
    return JSON.parse(savedSettings) || {};
  } catch {
    return {};
  }
};

export const saveUserSettings = (userId, settings) => {
  localStorage.setItem(getUserSettingsKey(userId), JSON.stringify(settings));
};

export const getPreferredCurrency = (userId) => getUserSettings(userId).currency || 'USD';

export const getPreferredFiscalYearStart = (userId) => getUserSettings(userId).fiscalYearStart || 'January';

export const getDarkModePreference = (userId) => Boolean(getUserSettings(userId).darkMode);

export const formatCurrencyWithCode = (value, currencyCode = 'USD', locale = 'en-US') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
