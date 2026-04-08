<script setup>
import Sidebar from '@/components/ui/admin/sidebar.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { convertFromUsd, fetchExchangeRates, getExchangeRate } from '@/utils/exchange-rates';
import { signOutCurrentUser } from '@/utils/auth-session';
import { formatCurrencyWithCode, getPreferredCurrency } from '@/utils/user-settings';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const router = useRouter();

const currentUser = ref(null);
const preferredCurrency = ref('USD');
const exchangeRatePayload = ref(null);
const processes = ref([]);
const isLoading = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const isSidebarExpanded = ref(false);
const form = ref({
  title: '',
  description: '',
  status: 'pending'
});

const formatCurrency = (value) =>
  formatCurrencyWithCode(
    convertFromUsd(value, preferredCurrency.value, exchangeRatePayload.value),
    preferredCurrency.value
  );

const exchangeRateNote = computed(() => {
  if (preferredCurrency.value === 'USD') {
    return 'Showing base values in USD.';
  }

  const rate = getExchangeRate(exchangeRatePayload.value, preferredCurrency.value);
  return `1 USD = ${formatCurrencyWithCode(rate, preferredCurrency.value)}`;
});

const metricCards = computed(() => [
  { label: 'Monthly Revenue', value: formatCurrency(48200), change: '+12.4%', icon: 'trending_up', tone: 'border-emerald-100 bg-emerald-50 text-emerald-600' },
  { label: 'Operating Expenses', value: formatCurrency(18640), change: '-3.1%', icon: 'payments', tone: 'border-rose-100 bg-rose-50 text-rose-600' },
  { label: 'Net Profit', value: formatCurrency(29560), change: '+8.7%', icon: 'account_balance_wallet', tone: 'border-blue-100 bg-blue-50 text-blue-600' },
  { label: 'Outstanding Invoices', value: '14', change: `${formatCurrency(9320)} due`, icon: 'receipt_long', tone: 'border-amber-100 bg-amber-50 text-amber-600' }
]);

const revenueTrend = [
  { month: 'Jan', revenue: 58, expense: 35 },
  { month: 'Feb', revenue: 64, expense: 38 },
  { month: 'Mar', revenue: 61, expense: 33 },
  { month: 'Apr', revenue: 72, expense: 40 },
  { month: 'May', revenue: 78, expense: 44 },
  { month: 'Jun', revenue: 86, expense: 48 }
];

const expenseBreakdown = [
  { label: 'Payroll', value: 42, color: 'bg-blue-600' },
  { label: 'Operations', value: 26, color: 'bg-sky-400' },
  { label: 'Marketing', value: 18, color: 'bg-emerald-400' },
  { label: 'Tools', value: 14, color: 'bg-amber-400' }
];

const cashflowItems = computed(() => [
  { label: 'Cash in bank', value: formatCurrency(124800), helper: 'Healthy runway for 4.2 months' },
  { label: 'Receivables', value: formatCurrency(21430), helper: '8 invoices due this week' },
  { label: 'Payables', value: formatCurrency(7860), helper: '3 supplier payments scheduled' }
]);

const recentActivity = [
  { title: 'VAT return ready for review', time: 'Today, 09:20', tone: 'bg-blue-50 text-blue-700' },
  { title: '4 invoices marked as paid', time: 'Today, 08:10', tone: 'bg-emerald-50 text-emerald-700' },
  { title: 'Payroll reminder for Friday', time: 'Yesterday, 16:45', tone: 'bg-amber-50 text-amber-700' }
];

const handleSidebarToggle = (expanded) => {
  isSidebarExpanded.value = expanded;
};

const processSummary = computed(() =>
  processes.value.reduce(
    (summary, process) => {
      summary.total += 1;
      summary[process.status] += 1;
      return summary;
    },
    { total: 0, pending: 0, in_progress: 0, completed: 0 }
  )
);

const loadProcesses = async () => {
  if (!currentUser.value?.user_id) {
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await fetch(`${API_BASE_URL}/processes?userId=${currentUser.value.user_id}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not load processes.');
    }

    processes.value = data;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
};

const createProcess = async () => {
  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    const response = await fetch(`${API_BASE_URL}/processes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: currentUser.value.user_id,
        title: form.value.title.trim(),
        description: form.value.description.trim(),
        status: form.value.status
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not create process.');
    }

    processes.value = [data, ...processes.value];
    form.value = {
      title: '',
      description: '',
      status: 'pending'
    };
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSubmitting.value = false;
  }
};

const logout = async () => {
  await signOutCurrentUser();
  router.push('/login');
};

const loadCurrencyPreferences = async () => {
  preferredCurrency.value = getPreferredCurrency(currentUser.value?.user_id);

  try {
    exchangeRatePayload.value = await fetchExchangeRates();
  } catch {
    exchangeRatePayload.value = null;
  }
};

const handleSettingsUpdated = () => {
  void loadCurrencyPreferences();
};

onMounted(async () => {
  const savedUser = localStorage.getItem('currentUser');

  if (!savedUser) {
    router.push('/login');
    return;
  }

  currentUser.value = JSON.parse(savedUser);
  await loadCurrencyPreferences();
  await loadProcesses();
  window.addEventListener('finflow-settings-updated', handleSettingsUpdated);
  window.addEventListener('storage', handleSettingsUpdated);
});

onUnmounted(() => {
  window.removeEventListener('finflow-settings-updated', handleSettingsUpdated);
  window.removeEventListener('storage', handleSettingsUpdated);
});
</script>

<template>
  <Sidebar
    @menuSelect="menu => console.log('Selected menu:', menu)"
    @toggle="handleSidebarToggle"
  />
  <div
    :class="[
      'min-h-screen bg-[radial gradient(circle at top,rgba(59,130,246,0.10),transparent 32%),linear-gradient(to bottom, #f8fbff, #f8fafc)] p-4 transition-[margin] duration-300 lg:p-8',
      isSidebarExpanded ? 'ml-72' : 'ml-24'
    ]"
  >
    <div class="mx-auto max-w-7xl">
      <section class="mb-8 rounded-4xl border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200 backdrop-blur-sm">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Financial Dashboard</p>
            <h1 class="mt-2 text-3xl font-black text-slate-900">
              {{ currentUser?.full_name || currentUser?.business_name || currentUser?.email }}
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Monitor revenue, spending, invoice health, and workflow activity from one bookkeeping workspace.
            </p>
            <p class="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              {{ exchangeRateNote }}
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <div class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p class="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">Processes</p>
              <p class="mt-1 text-2xl font-black text-slate-900">{{ processSummary.total }}</p>
            </div>
            <button @click="logout" class="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Log out
            </button>
          </div>
        </div>
      </section>

      <section class="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in metricCards"
          :key="card.label"
          class="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/70"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-slate-500">{{ card.label }}</p>
              <p class="mt-3 text-3xl font-black tracking-tight text-slate-950">{{ card.value }}</p>
            </div>
            <span :class="['material-symbols-outlined rounded-2xl border px-3 py-3 text-[24px]', card.tone]">
              {{ card.icon }}
            </span>
          </div>
          <p class="mt-4 text-sm font-bold text-slate-600">{{ card.change }}</p>
        </article>
      </section>

      <section class="mb-6 grid gap-6 xl:grid-cols-[1.65fr,1fr]">
        <article class="rounded-4xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-xl font-black text-slate-900">Revenue vs Expenses</h2>
              <p class="mt-1 text-sm text-slate-500">A six-month snapshot of core business performance.</p>
            </div>
            <span class="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
              Last 6 months
            </span>
          </div>

          <div class="mt-8 grid h-80 grid-cols-6 items-end gap-4">
            <div v-for="item in revenueTrend" :key="item.month" class="flex h-full flex-col justify-end">
              <div class="flex h-full items-end justify-center gap-2">
                <div class="w-5 rounded-t-full bg-slate-200/90" :style="{ height: `${item.expense}%` }"></div>
                <div class="w-5 rounded-t-full bg-blue-600" :style="{ height: `${item.revenue}%` }"></div>
              </div>
              <p class="mt-3 text-center text-xs font-bold uppercase tracking-wide text-slate-400">{{ item.month }}</p>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap gap-5 text-sm font-semibold text-slate-500">
            <span class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-blue-600"></span>Revenue</span>
            <span class="flex items-center gap-2"><span class="h-3 w-3 rounded-full bg-slate-300"></span>Expenses</span>
          </div>
        </article>

        <article class="rounded-4xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-slate-900">Expense Breakdown</h2>
              <p class="mt-1 text-sm text-slate-500">Where money is going this month.</p>
            </div>
            <div
              class="grid h-20 w-20 place-items-center rounded-full text-sm font-black text-slate-900"
              style="background: conic-gradient(#2563eb 0deg 150deg, #38bdf8 150deg 245deg, #4ade80 245deg 310deg, #fbbf24 310deg 360deg);"
            >
              <div class="grid h-14 w-14 place-items-center rounded-full bg-white">100%</div>
            </div>
          </div>

          <div class="mt-8 space-y-5">
            <div v-for="item in expenseBreakdown" :key="item.label">
              <div class="mb-2 flex items-center justify-between text-sm font-semibold text-slate-600">
                <span>{{ item.label }}</span>
                <span>{{ item.value }}%</span>
              </div>
              <div class="h-3 rounded-full bg-slate-100">
                <div :class="['h-3 rounded-full', item.color]" :style="{ width: `${item.value}%` }"></div>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="mb-6 grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
        <article class="rounded-4xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-slate-900">Cashflow Snapshot</h2>
              <p class="mt-1 text-sm text-slate-500">The numbers you need for day-to-day bookkeeping decisions.</p>
            </div>
            <span class="rounded-full border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
              Stable
            </span>
          </div>

          <div class="mt-6 grid gap-4 md:grid-cols-3">
            <div v-for="item in cashflowItems" :key="item.label" class="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p class="text-sm font-semibold text-slate-500">{{ item.label }}</p>
              <p class="mt-3 text-2xl font-black text-slate-950">{{ item.value }}</p>
              <p class="mt-2 text-sm leading-6 text-slate-500">{{ item.helper }}</p>
            </div>
          </div>

          <div class="mt-6 grid gap-4 sm:grid-cols-3">
            <div class="rounded-2xl bg-slate-950 p-5 text-white">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Pending</p>
              <p class="mt-2 text-3xl font-black">{{ processSummary.pending }}</p>
            </div>
            <div class="rounded-2xl bg-amber-50 p-5">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">In Progress</p>
              <p class="mt-2 text-3xl font-black text-slate-950">{{ processSummary.in_progress }}</p>
            </div>
            <div class="rounded-2xl bg-emerald-50 p-5">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Completed</p>
              <p class="mt-2 text-3xl font-black text-slate-950">{{ processSummary.completed }}</p>
            </div>
          </div>
        </article>

        <article class="rounded-4xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <h2 class="text-xl font-black text-slate-900">Recent Activity</h2>
          <p class="mt-1 text-sm text-slate-500">Important bookkeeping signals for today.</p>

          <div class="mt-6 space-y-4">
            <div v-for="item in recentActivity" :key="item.title" class="rounded-2xl border border-slate-100 p-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-bold text-slate-900">{{ item.title }}</p>
                  <p class="mt-1 text-sm text-slate-500">{{ item.time }}</p>
                </div>
                <span :class="['rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', item.tone]">Live</span>
              </div>
            </div>
          </div>

          <div class="mt-6 rounded-3xl bg-blue-600 p-5 text-white shadow-lg shadow-blue-600/20">
            <p class="text-xs font-bold uppercase tracking-[0.24em] text-blue-100">Bookkeeping Tip</p>
            <p class="mt-3 text-sm leading-6 text-blue-50">
              Reconcile outstanding invoices twice a week to keep your cashflow forecasts accurate.
            </p>
          </div>
        </article>
      </section>

      <section class="grid gap-6 lg:grid-cols-[380px,1fr]">
        <article class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200">
          <h2 class="text-xl font-black text-slate-900">New Process</h2>
          <p class="mt-2 text-sm text-slate-500">Add a process for this account.</p>

          <form class="mt-6 space-y-4" @submit.prevent="createProcess">
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Title</label>
              <input v-model="form.title" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="e.g. Customer onboarding">
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Description</label>
              <textarea v-model="form.description" rows="4" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="Optional notes about this process"></textarea>
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Status</label>
              <select v-model="form.status" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50">
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <p v-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              {{ errorMessage }}
            </p>

            <button :disabled="!form.title.trim() || isSubmitting" class="w-full rounded-xl bg-blue-600 px-5 py-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {{ isSubmitting ? 'Creating...' : 'Create Process' }}
            </button>
          </form>
        </article>

        <article class="rounded-4xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-slate-900">Your Processes</h2>
              <p class="mt-2 text-sm text-slate-500">Recent process records for this account.</p>
            </div>

            <button @click="loadProcesses" class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Refresh
            </button>
          </div>

          <div v-if="isLoading" class="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-8 text-sm font-medium text-slate-500">
            Loading processes...
          </div>

          <div v-else-if="processes.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
            No processes yet. Create your first one from the form.
          </div>

          <div v-else class="mt-6 space-y-4">
            <article v-for="process in processes" :key="process.process_id" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 class="text-lg font-bold text-slate-900">{{ process.title }}</h3>
                  <p class="mt-2 text-sm text-slate-600">{{ process.description || 'No description provided.' }}</p>
                </div>

                <span
                  class="inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
                  :class="process.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : process.status === 'in_progress'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-200 text-slate-700'"
                >
                  {{ process.status.replace('_', ' ') }}
                </span>
              </div>

              <p class="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">
                Created {{ new Date(process.created_at).toLocaleString() }}
              </p>
            </article>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap");
</style>
