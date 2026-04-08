<script setup>
import { onMounted, onUnmounted } from 'vue';
import { supabase } from '@/lib/supabase';
import { clearCurrentUser, hydrateCurrentUserFromSession } from '@/utils/auth-session';
import { getCurrentUser, getDarkModePreference } from '@/utils/user-settings';

const applyTheme = () => {
  const user = getCurrentUser();
  const darkMode = getDarkModePreference(user?.user_id);
  document.documentElement.classList.toggle('dark', darkMode);
};

let authSubscription = null;

onMounted(() => {
  void hydrateCurrentUserFromSession()
    .catch(() => {
      clearCurrentUser();
    })
    .finally(() => {
      applyTheme();
    });

  applyTheme();
  window.addEventListener('storage', applyTheme);
  window.addEventListener('finflow-theme-updated', applyTheme);

  if (supabase) {
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        void hydrateCurrentUserFromSession().finally(() => {
          applyTheme();
        });
        return;
      }

      clearCurrentUser();
      applyTheme();
    });

    authSubscription = listener.data.subscription;
  }
});

onUnmounted(() => {
  window.removeEventListener('storage', applyTheme);
  window.removeEventListener('finflow-theme-updated', applyTheme);
  authSubscription?.unsubscribe();
});
</script>

<template>
  <router-view />
</template>

