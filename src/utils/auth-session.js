import { supabase } from '@/lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const getApiBaseUrl = () => API_BASE_URL;

export const persistCurrentUser = (user) => {
  localStorage.setItem('currentUser', JSON.stringify(user));
  window.dispatchEvent(new Event('storage'));
};

export const clearCurrentUser = () => {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('storage'));
};

export const syncAuthenticatedUser = async (accessToken) => {
  if (!accessToken) {
    throw new Error('No Supabase access token was provided.');
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Could not sync authenticated user.');
  }

  persistCurrentUser(data.user);
  return data.user;
};

export const hydrateCurrentUserFromSession = async () => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const session = data.session;

  if (!session?.access_token) {
    clearCurrentUser();
    return null;
  }

  return syncAuthenticatedUser(session.access_token);
};

export const signOutCurrentUser = async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }

  clearCurrentUser();
};
