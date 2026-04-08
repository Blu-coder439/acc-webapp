const EXCHANGE_RATE_STORAGE_KEY = 'finflow-exchange-rates-usd';
const EXCHANGE_RATE_CACHE_DURATION_MS = 12 * 60 * 60 * 1000;
const EXCHANGE_RATE_API_URL = 'https://open.er-api.com/v6/latest/USD';

const normalizeRatesPayload = (payload) => {
  if (!payload || typeof payload !== 'object' || typeof payload.rates !== 'object') {
    return null;
  }

  return {
    fetchedAt: Number(payload.fetchedAt || Date.now()),
    rates: payload.rates
  };
};

export const getCachedExchangeRates = () => {
  try {
    const saved = localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return normalizeRatesPayload(parsed);
  } catch {
    return null;
  }
};

const cacheExchangeRates = (payload) => {
  localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, JSON.stringify(payload));
};

export const fetchExchangeRates = async ({ forceRefresh = false } = {}) => {
  const cached = getCachedExchangeRates();

  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < EXCHANGE_RATE_CACHE_DURATION_MS
  ) {
    return cached;
  }

  try {
    const response = await fetch(EXCHANGE_RATE_API_URL);
    const data = await response.json();

    if (!response.ok || data?.result !== 'success' || typeof data?.rates !== 'object') {
      throw new Error('Could not load exchange rates.');
    }

    const payload = {
      fetchedAt: Date.now(),
      rates: data.rates
    };

    cacheExchangeRates(payload);
    return payload;
  } catch (error) {
    if (cached) {
      return cached;
    }

    throw error;
  }
};

export const getExchangeRate = (exchangeRatePayload, currencyCode = 'USD') => {
  if (currencyCode === 'USD') {
    return 1;
  }

  return Number(exchangeRatePayload?.rates?.[currencyCode] || 1);
};

export const convertFromUsd = (value, currencyCode = 'USD', exchangeRatePayload = null) => {
  const amount = Number(value || 0);
  return amount * getExchangeRate(exchangeRatePayload, currencyCode);
};
