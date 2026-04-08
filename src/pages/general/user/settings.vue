<script setup>
import Sidebar from '@/components/ui/admin/sidebar.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { signOutCurrentUser } from '@/utils/auth-session';
import { getCurrentUser, getUserSettings, saveUserSettings } from '@/utils/user-settings';

const router = useRouter();

const isSidebarExpanded = ref(false);
const currentUser = ref(null);
const successMessage = ref('');
let successMessageTimeout = null;

const defaultSettings = {
  currency: 'USD',
  fiscalYearStart: 'January',
  defaultReportView: 'Monthly',
  darkMode: false,
  emailNotifications: true,
  overdueAlerts: true,
  weeklySummary: false
};

const settingsForm = ref({ ...defaultSettings });

const displayName = computed(() =>
  currentUser.value?.full_name || currentUser.value?.business_name || currentUser.value?.email || 'Settings'
);

const settingsCards = computed(() => [
  {
    label: 'Currency',
    value: settingsForm.value.currency,
    helper: 'How amounts are shown across the workspace',
    tone: 'border-blue-100 bg-blue-50 text-blue-700',
    icon: 'payments'
  },
  {
    label: 'Fiscal Year',
    value: settingsForm.value.fiscalYearStart,
    helper: 'Starting month used in reports and comparisons',
    tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    icon: 'calendar_month'
  },
  {
    label: 'Report View',
    value: settingsForm.value.defaultReportView,
    helper: 'Preferred reporting rhythm for future views',
    tone: 'border-amber-100 bg-amber-50 text-amber-700',
    icon: 'bar_chart'
  },
  {
    label: 'Theme',
    value: settingsForm.value.darkMode ? 'Dark' : 'Light',
    helper: 'Workspace appearance preference',
    tone: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: 'dark_mode'
  }
]);

const insightBlocks = computed(() => [
  {
    label: 'Theme Mode',
    value: settingsForm.value.darkMode ? 'Dark mode enabled' : 'Light mode enabled',
    helper: 'Applied immediately after saving.',
    tone: 'rounded-2xl bg-slate-950 p-5 text-white'
  },
  {
    label: 'Alert Coverage',
    value: settingsForm.value.overdueAlerts ? 'Overdue tracking on' : 'Overdue tracking off',
    helper: 'Keeps overdue balances visible in day-to-day work.',
    tone: 'rounded-2xl border border-blue-100 bg-blue-50 p-5'
  },
  {
    label: 'Summary Rhythm',
    value: settingsForm.value.weeklySummary ? 'Weekly summaries enabled' : 'Weekly summaries disabled',
    helper: 'Useful when you want regular reporting reminders.',
    tone: 'rounded-2xl border border-amber-100 bg-amber-50 p-5'
  }
]);

const loadSettings = () => {
  settingsForm.value = {
    ...defaultSettings,
    ...getUserSettings(currentUser.value?.user_id)
  };
};

const handleSidebarToggle = (expanded) => {
  isSidebarExpanded.value = expanded;
};

const saveSettingsHandler = () => {
  if (successMessageTimeout) {
    clearTimeout(successMessageTimeout);
  }

  saveUserSettings(currentUser.value?.user_id, settingsForm.value);
  successMessage.value = 'Settings saved successfully.';
  window.dispatchEvent(new Event('finflow-theme-updated'));
  window.dispatchEvent(new Event('finflow-settings-updated'));

  successMessageTimeout = window.setTimeout(() => {
    successMessage.value = '';
    successMessageTimeout = null;
  }, 3000);
};

const logout = async () => {
  await signOutCurrentUser();
  router.push('/login');
};

onMounted(() => {
  const user = getCurrentUser();

  if (!user) {
    router.push('/login');
    return;
  }

  currentUser.value = user;
  loadSettings();
});

onUnmounted(() => {
  if (successMessageTimeout) {
    clearTimeout(successMessageTimeout);
  }
});
</script>

<template>
  <Sidebar @toggle="handleSidebarToggle" />
  <div
    :class="[
      'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.10),_transparent_30%),linear-gradient(to_bottom,_#fffdf7,_#f8fafc)] p-4 transition-[margin] duration-300 dark:bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.14),_transparent_28%),linear-gradient(to_bottom,_#020617,_#0f172a)] lg:p-8',
      isSidebarExpanded ? 'ml-72' : 'ml-24'
    ]"
  >
    <div class="mx-auto max-w-7xl">
      <section class="mb-8 rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-950/90 dark:shadow-slate-950/40">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-300">Settings</p>
            <h1 class="mt-2 text-3xl font-black text-slate-900 dark:text-slate-50">{{ displayName }}</h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-300">
              Tune how your workspace behaves, how reports are grouped, and how the app looks each time you come back.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <div class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
              <p class="text-xs font-bold uppercase tracking-[0.22em] text-amber-500 dark:text-amber-300">Preferences</p>
              <p class="mt-1 text-2xl font-black text-slate-900 dark:text-slate-50">7 Controls</p>
            </div>
            <button @click="logout" class="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-900">
              Log out
            </button>
          </div>
        </div>
      </section>

      <section class="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in settingsCards"
          :key="card.label"
          class="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-950 dark:shadow-slate-950/30"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-500 dark:text-slate-300">{{ card.label }}</p>
              <p class="mt-3 break-words text-2xl font-black tracking-tight text-slate-950 dark:text-slate-50">{{ card.value }}</p>
            </div>
            <span :class="['material-symbols-outlined shrink-0 rounded-2xl border px-3 py-3 text-[24px]', card.tone]">
              {{ card.icon }}
            </span>
          </div>
          <p class="mt-4 text-sm font-bold text-slate-600 dark:text-slate-300">{{ card.helper }}</p>
        </article>
      </section>

      <section class="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:shadow-slate-950/30">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-slate-900 dark:text-slate-50">Workspace Preferences</h2>
              <p class="mt-1 text-sm text-slate-500 dark:text-slate-300">Save the defaults you want the app to use moving forward.</p>
            </div>
          </div>

          <form class="mt-6 space-y-6" @submit.prevent="saveSettingsHandler">
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label class="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Default Currency</label>
                <select v-model="settingsForm.currency" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-amber-950/60">
                  <option>USD</option>
                  <option>GHS</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </div>

              <div>
                <label class="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Fiscal Year Start</label>
                <select v-model="settingsForm.fiscalYearStart" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-amber-950/60">
                  <option>January</option>
                  <option>April</option>
                  <option>July</option>
                  <option>October</option>
                </select>
              </div>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Default Report View</label>
              <select v-model="settingsForm.defaultReportView" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-4 focus:ring-amber-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-amber-950/60">
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Quarterly</option>
                <option>Yearly</option>
              </select>
            </div>

            <div class="space-y-4">
              <label class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Notifications And Display</label>

              <label class="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p class="font-bold text-slate-900 dark:text-slate-50">Dark Mode</p>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-300">Switch the workspace to a darker appearance.</p>
                </div>
                <input v-model="settingsForm.darkMode" type="checkbox" class="h-5 w-5 rounded border-slate-300 text-amber-500 focus:ring-amber-400">
              </label>

              <label class="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p class="font-bold text-slate-900 dark:text-slate-50">Email Notifications</p>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-300">Use email as a channel for account updates.</p>
                </div>
                <input v-model="settingsForm.emailNotifications" type="checkbox" class="h-5 w-5 rounded border-slate-300 text-amber-500 focus:ring-amber-400">
              </label>

              <label class="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p class="font-bold text-slate-900 dark:text-slate-50">Overdue Alerts</p>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-300">Highlight overdue receivables and payables clearly.</p>
                </div>
                <input v-model="settingsForm.overdueAlerts" type="checkbox" class="h-5 w-5 rounded border-slate-300 text-amber-500 focus:ring-amber-400">
              </label>

              <label class="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
                <div>
                  <p class="font-bold text-slate-900 dark:text-slate-50">Weekly Summary</p>
                  <p class="mt-1 text-sm text-slate-500 dark:text-slate-300">Prepare a weekly snapshot of your reporting activity.</p>
                </div>
                <input v-model="settingsForm.weeklySummary" type="checkbox" class="h-5 w-5 rounded border-slate-300 text-amber-500 focus:ring-amber-400">
              </label>
            </div>

            <p v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              {{ successMessage }}
            </p>

            <button class="w-full rounded-xl bg-slate-950 px-5 py-4 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
              Save Workspace Settings
            </button>
          </form>
        </article>

        <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:shadow-slate-950/30">
          <h2 class="text-xl font-black text-slate-900 dark:text-slate-50">Settings Insights</h2>
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-300">A quick read on how your current preferences shape the workspace.</p>

          <div class="mt-6 space-y-4">
            <div v-for="item in insightBlocks" :key="item.label" :class="item.tone">
              <p :class="item.tone.includes('bg-slate-950') ? 'text-xs font-bold uppercase tracking-[0.2em] text-slate-400' : 'text-xs font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-300'">
                {{ item.label }}
              </p>
              <p :class="item.tone.includes('bg-slate-950') ? 'mt-2 text-3xl font-black text-white' : 'mt-2 text-3xl font-black text-slate-950 dark:text-slate-50'">
                {{ item.value }}
              </p>
              <p :class="item.tone.includes('bg-slate-950') ? 'mt-2 text-sm text-slate-300' : 'mt-2 text-sm text-slate-500 dark:text-slate-300'">
                {{ item.helper }}
              </p>
            </div>
          </div>

          <div class="mt-6 rounded-[1.5rem] bg-amber-50 p-5 dark:bg-amber-950/40">
            <p class="text-xs font-bold uppercase tracking-[0.24em] text-amber-600 dark:text-amber-300">Storage Note</p>
            <p class="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              These settings are stored per signed-in user in your browser, so they persist across your pages on this device.
            </p>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap");
</style>
