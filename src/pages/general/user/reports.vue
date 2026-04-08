<script setup>
import Sidebar from '@/components/ui/admin/sidebar.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { signOutCurrentUser } from '@/utils/auth-session';
import { convertFromUsd, fetchExchangeRates, getExchangeRate } from '@/utils/exchange-rates';
import { formatCurrencyWithCode, getPreferredCurrency } from '@/utils/user-settings';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const router = useRouter();

const isSidebarExpanded = ref(false);
const currentUser = ref(null);
const preferredCurrency = ref('USD');
const exchangeRatePayload = ref(null);
const transactions = ref([]);
const isLoading = ref(true);
const reportRecords = ref([]);
const selectedReportRecordId = ref(null);
const errorMessage = ref('');

const typeStyles = {
  Revenue: 'bg-emerald-50 text-emerald-700',
  Expense: 'bg-rose-50 text-rose-700',
  Receivable: 'bg-blue-50 text-blue-700',
  Payable: 'bg-amber-50 text-amber-700'
};

const statusStyles = {
  Cleared: 'bg-emerald-50 text-emerald-700',
  Processed: 'bg-emerald-50 text-emerald-700',
  Pending: 'bg-slate-100 text-slate-700',
  Scheduled: 'bg-amber-50 text-amber-700',
  Overdue: 'bg-rose-50 text-rose-700',
  'Due Soon': 'bg-amber-50 text-amber-700',
  Open: 'bg-blue-50 text-blue-700',
  Urgent: 'bg-rose-50 text-rose-700',
  Upcoming: 'bg-blue-50 text-blue-700'
};

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

const formatDate = (value) => {
  if (!value) {
    return 'No date';
  }

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatDateTime = (value) => {
  if (!value) {
    return 'No timestamp';
  }

  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const transactionSummary = computed(() => {
  return transactions.value.reduce(
    (summary, item) => {
      const amount = Number(item.amount || 0);

      if (item.entry_type === 'Revenue') {
        summary.revenue += amount;
      }

      if (item.entry_type === 'Expense') {
        summary.expenses += amount;
      }

      if (item.entry_type === 'Receivable') {
        summary.receivables += amount;
      }

      if (item.entry_type === 'Payable') {
        summary.payables += amount;
      }

      return summary;
    },
    {
      revenue: 0,
      expenses: 0,
      receivables: 0,
      payables: 0
    }
  );
});

const reportCards = computed(() => [
  {
    label: 'Net Income',
    value: formatCurrency(transactionSummary.value.revenue - transactionSummary.value.expenses),
    helper: 'Revenue less operating expenses',
    tone: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    icon: 'trending_up'
  },
  {
    label: 'Collection Exposure',
    value: formatCurrency(transactionSummary.value.receivables),
    helper: 'Outstanding customer balances',
    tone: 'border-blue-100 bg-blue-50 text-blue-700',
    icon: 'receipt_long'
  },
  {
    label: 'Payment Exposure',
    value: formatCurrency(transactionSummary.value.payables),
    helper: 'Supplier obligations still open',
    tone: 'border-amber-100 bg-amber-50 text-amber-700',
    icon: 'account_balance'
  },
  {
    label: 'Total Activity',
    value: `${transactions.value.length}`,
    helper: 'Entries included in this report',
    tone: 'border-slate-200 bg-slate-100 text-slate-700',
    icon: 'bar_chart'
  }
]);

const categoryBreakdown = computed(() => {
  const map = new Map();

  transactions.value.forEach((item) => {
    const key = item.category || 'Uncategorized';
    const amount = Number(item.amount || 0);
    map.set(key, (map.get(key) || 0) + amount);
  });

  const total = Array.from(map.values()).reduce((sum, amount) => sum + amount, 0);

  return Array.from(map.entries())
    .map(([label, amount], index) => ({
      label,
      amount,
      share: total ? Math.round((amount / total) * 100) : 0,
      color: ['bg-blue-600', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-500'][index % 5]
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
});

const typeBreakdown = computed(() => {
  const totals = [
    { label: 'Revenue', amount: transactionSummary.value.revenue, helper: 'Cash coming in' },
    { label: 'Expense', amount: transactionSummary.value.expenses, helper: 'Cash going out' },
    { label: 'Receivable', amount: transactionSummary.value.receivables, helper: 'Customer balances due' },
    { label: 'Payable', amount: transactionSummary.value.payables, helper: 'Supplier balances due' }
  ];

  const largestAmount = Math.max(...totals.map((item) => item.amount), 0);

  return totals.map((item) => ({
    ...item,
    width: largestAmount ? Math.max((item.amount / largestAmount) * 100, item.amount > 0 ? 12 : 0) : 0
  }));
});

const receivablesToChase = computed(() =>
  transactions.value
    .filter((item) => item.entry_type === 'Receivable' && ['Overdue', 'Due Soon', 'Pending'].includes(item.status))
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 5)
);

const payablesToSettle = computed(() =>
  transactions.value
    .filter((item) => item.entry_type === 'Payable' && ['Urgent', 'Due Soon', 'Pending'].includes(item.status))
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
    .slice(0, 5)
);

const recentTransactions = computed(() =>
  [...transactions.value]
    .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
    .slice(0, 6)
);

const reportInsights = computed(() => [
  {
    label: 'Revenue Coverage',
    value: transactionSummary.value.expenses
      ? `${(transactionSummary.value.revenue / transactionSummary.value.expenses).toFixed(1)}x`
      : 'N/A',
    helper: 'How many times revenue covers expenses',
    tone: 'rounded-2xl bg-slate-950 p-5 text-white'
  },
  {
    label: 'Overdue Receivables',
    value: `${transactions.value.filter((item) => item.entry_type === 'Receivable' && item.status === 'Overdue').length}`,
    helper: 'Balances needing immediate follow-up',
    tone: 'rounded-2xl border border-blue-100 bg-blue-50 p-5'
  },
  {
    label: 'Urgent Payables',
    value: `${transactions.value.filter((item) => item.entry_type === 'Payable' && ['Urgent', 'Due Soon'].includes(item.status)).length}`,
    helper: 'Bills likely to affect cashflow soon',
    tone: 'rounded-2xl border border-amber-100 bg-amber-50 p-5'
  }
]);

const reportStorageKey = computed(() =>
  currentUser.value?.user_id ? `finflow-report-records-${currentUser.value.user_id}` : 'finflow-report-records-guest'
);

const selectedReportRecord = computed(() =>
  reportRecords.value.find((item) => item.id === selectedReportRecordId.value) || null
);

const liveReportWindow = computed(() => {
  if (transactions.value.length === 0) {
    return 'No transaction dates available';
  }

  const dates = transactions.value
    .map((item) => item.transaction_date)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b));

  return dates.length ? `${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])}` : 'No transaction dates available';
});

const buildReportRecord = () => {
  const now = new Date().toISOString();
  const topCategory = categoryBreakdown.value[0]?.label || 'No category data';

  return {
    id: `report-${Date.now()}`,
    generatedAt: now,
    entryCount: transactions.value.length,
    reportWindow: liveReportWindow.value,
    topCategory,
    totals: {
      revenue: transactionSummary.value.revenue,
      expenses: transactionSummary.value.expenses,
      receivables: transactionSummary.value.receivables,
      payables: transactionSummary.value.payables,
      net: transactionSummary.value.revenue - transactionSummary.value.expenses
    }
  };
};

const persistReportRecords = (records) => {
  localStorage.setItem(reportStorageKey.value, JSON.stringify(records));
  reportRecords.value = records;
};

const loadReportRecords = () => {
  const saved = localStorage.getItem(reportStorageKey.value);
  let parsed = [];

  try {
    parsed = saved ? JSON.parse(saved) : [];
  } catch {
    parsed = [];
  }

  reportRecords.value = Array.isArray(parsed) ? parsed : [];

  if (reportRecords.value.length > 0 && !selectedReportRecordId.value) {
    selectedReportRecordId.value = reportRecords.value[0].id;
  }
};

const saveReportRecord = () => {
  const record = buildReportRecord();
  const nextRecords = [record, ...reportRecords.value].slice(0, 12);
  persistReportRecords(nextRecords);
  selectedReportRecordId.value = record.id;
};

const printReport = () => {
  saveReportRecord();

  window.requestAnimationFrame(() => {
    window.print();
  });
};

const loadTransactions = async () => {
  if (!currentUser.value?.user_id) {
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const response = await fetch(`${API_BASE_URL}/transactions?userId=${currentUser.value.user_id}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not load report data.');
    }

    transactions.value = data;
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
};

const handleSidebarToggle = (expanded) => {
  isSidebarExpanded.value = expanded;
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
  await loadTransactions();
  loadReportRecords();
  window.addEventListener('finflow-settings-updated', handleSettingsUpdated);
  window.addEventListener('storage', handleSettingsUpdated);
});

onUnmounted(() => {
  window.removeEventListener('finflow-settings-updated', handleSettingsUpdated);
  window.removeEventListener('storage', handleSettingsUpdated);
});
</script>

<template>
  <Sidebar @toggle="handleSidebarToggle" />
  <div
    :class="[
      'min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_30%),linear-gradient(to_bottom,_#f9fcff,_#f8fafc)] p-4 transition-[margin] duration-300 lg:p-8',
      isSidebarExpanded ? 'ml-72' : 'ml-24'
    ]"
  >
    <div class="mx-auto max-w-7xl">
      <section class="report-shell mb-8 rounded-[2rem] border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200 backdrop-blur-sm">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.25em] text-sky-600">Reports</p>
            <h1 class="mt-2 text-3xl font-black text-slate-900">Financial Reporting Hub</h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Review profitability, balance exposure, and recent transaction movement for
              {{ currentUser?.business_name || currentUser?.full_name || currentUser?.email }}.
            </p>
            <p class="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              {{ exchangeRateNote }}
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <div class="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p class="text-xs font-bold uppercase tracking-[0.22em] text-sky-500">Entries Analysed</p>
              <p class="mt-1 text-2xl font-black text-slate-900">{{ transactions.length }}</p>
            </div>
            <button @click="saveReportRecord" class="print-hidden rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Save Record
            </button>
            <button @click="printReport" class="print-hidden rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-sky-700">
              Print Report
            </button>
            <button @click="loadTransactions" class="print-hidden rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
              Refresh Report
            </button>
            <button @click="logout" class="print-hidden rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Log out
            </button>
          </div>
        </div>
      </section>

      <p v-if="errorMessage" class="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
        {{ errorMessage }}
      </p>

      <section class="report-shell mb-3 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in reportCards"
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
          <p class="mt-4 text-sm font-bold text-slate-600">{{ card.helper }}</p>
        </article>
      </section>

      <section v-if="isLoading" class="report-shell mb-6 rounded-[2rem] border border-slate-200 bg-white p-8 text-sm font-medium text-slate-500 shadow-xl shadow-slate-200">
        Loading report data...
      </section>

      <template v-else>
        <section class="report-shell mb-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-black text-slate-900">Report Window</h2>
              <p class="mt-1 text-sm text-slate-500">The live report currently covers {{ liveReportWindow }}.</p>
            </div>
            <p class="text-sm font-semibold text-slate-600">Generated from {{ transactions.length }} transactions</p>
          </div>
        </section>

        <section class="report-shell mb-6 grid gap-6 xl:grid-cols-[1.4fr,0.9fr]">
          <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-xl font-black text-slate-900">By Transaction Type</h2>
                <p class="mt-1 text-sm text-slate-500">A quick read on where money is earned, spent, owed, and due.</p>
              </div>
              <span class="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Live View</span>
            </div>

            <div class="mt-8 space-y-5">
              <div v-for="item in typeBreakdown" :key="item.label">
                <div class="mb-2 flex items-center justify-between gap-4 text-sm font-semibold text-slate-600">
                  <div class="flex items-center gap-3">
                    <span :class="['inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', typeStyles[item.label]]">
                      {{ item.label }}
                    </span>
                    <span>{{ item.helper }}</span>
                  </div>
                  <span class="font-black text-slate-950">{{ formatCurrency(item.amount) }}</span>
                </div>
                <div class="h-3 rounded-full bg-slate-100">
                  <div :class="['h-3 rounded-full', item.label === 'Revenue' ? 'bg-emerald-500' : item.label === 'Expense' ? 'bg-rose-500' : item.label === 'Receivable' ? 'bg-blue-500' : 'bg-amber-500']" :style="{ width: `${item.width}%` }"></div>
                </div>
              </div>
            </div>
          </article>

          <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
            <h2 class="text-xl font-black text-slate-900">Report Insights</h2>
            <p class="mt-1 text-sm text-slate-500">Small signals that help you act faster.</p>

            <div class="mt-6 space-y-4">
              <div v-for="item in reportInsights" :key="item.label" :class="item.tone">
                <p :class="item.tone.includes('bg-slate-950') ? 'text-xs font-bold uppercase tracking-[0.2em] text-slate-400' : 'text-xs font-bold uppercase tracking-[0.2em] text-slate-500'">
                  {{ item.label }}
                </p>
                <p :class="item.tone.includes('bg-slate-950') ? 'mt-2 text-3xl font-black text-white' : 'mt-2 text-3xl font-black text-slate-950'">
                  {{ item.value }}
                </p>
                <p :class="item.tone.includes('bg-slate-950') ? 'mt-2 text-sm text-slate-300' : 'mt-2 text-sm text-slate-500'">
                  {{ item.helper }}
                </p>
              </div>
            </div>
          </article>
        </section>

        <section class="report-shell mb-6 grid gap-6 lg:grid-cols-[1fr,0.95fr]">
          <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-xl font-black text-slate-900">Category Breakdown</h2>
                <p class="mt-1 text-sm text-slate-500">The biggest categories by total transaction value.</p>
              </div>
              <span class="rounded-full bg-sky-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Top 5</span>
            </div>

            <div v-if="categoryBreakdown.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
              No category data yet. Add transactions to generate breakdowns.
            </div>

            <div v-else class="mt-8 space-y-5">
              <div v-for="item in categoryBreakdown" :key="item.label">
                <div class="mb-2 flex items-center justify-between text-sm font-semibold text-slate-600">
                  <span>{{ item.label }}</span>
                  <span>{{ formatCurrency(item.amount) }} | {{ item.share }}%</span>
                </div>
                <div class="h-3 rounded-full bg-slate-100">
                  <div :class="['h-3 rounded-full', item.color]" :style="{ width: `${item.share}%` }"></div>
                </div>
              </div>
            </div>
          </article>

          <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
            <h2 class="text-xl font-black text-slate-900">Recent Movements</h2>
            <p class="mt-1 text-sm text-slate-500">Latest transactions included in the report.</p>

            <div v-if="recentTransactions.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
              No transactions available yet.
            </div>

            <div v-else class="mt-6 space-y-4">
              <article v-for="item in recentTransactions" :key="item.transaction_id" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-lg font-bold text-slate-900">{{ item.party_name }}</p>
                    <p class="mt-1 text-sm text-slate-500">{{ item.category || 'Uncategorized' }} | {{ formatDate(item.transaction_date) }}</p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-xl font-black text-slate-950">{{ formatCurrency(item.amount) }}</p>
                    <span :class="['mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', typeStyles[item.entry_type] || 'bg-slate-100 text-slate-700']">
                      {{ item.entry_type }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </article>
        </section>

        <section class="report-shell mb-6 grid gap-6 lg:grid-cols-2">
          <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-xl font-black text-slate-900">Receivables To Chase</h2>
                <p class="mt-1 text-sm text-slate-500">Customer balances that may need follow-up.</p>
              </div>
              <span class="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Receivables</span>
            </div>

            <div v-if="receivablesToChase.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
              No receivables currently need attention.
            </div>

            <div v-else class="mt-6 space-y-4">
              <article v-for="item in receivablesToChase" :key="item.transaction_id" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-lg font-bold text-slate-900">{{ item.party_name }}</p>
                    <p class="mt-1 text-sm text-slate-500">Due {{ formatDate(item.due_date) }}</p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-xl font-black text-slate-950">{{ formatCurrency(item.amount) }}</p>
                    <span :class="['mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[item.status] || 'bg-slate-100 text-slate-700']">
                      {{ item.status }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </article>

          <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="text-xl font-black text-slate-900">Payables To Settle</h2>
                <p class="mt-1 text-sm text-slate-500">Supplier obligations that could affect cash availability.</p>
              </div>
              <span class="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Payables</span>
            </div>

            <div v-if="payablesToSettle.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
              No payables currently need urgent attention.
            </div>

            <div v-else class="mt-6 space-y-4">
              <article v-for="item in payablesToSettle" :key="item.transaction_id" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p class="text-lg font-bold text-slate-900">{{ item.party_name }}</p>
                    <p class="mt-1 text-sm text-slate-500">Due {{ formatDate(item.due_date) }}</p>
                  </div>
                  <div class="text-left sm:text-right">
                    <p class="text-xl font-black text-slate-950">{{ formatCurrency(item.amount) }}</p>
                    <span :class="['mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[item.status] || 'bg-slate-100 text-slate-700']">
                      {{ item.status }}
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </article>
        </section>

        <section class="report-shell mb-6 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-xl font-black text-slate-900">Report Records</h2>
              <p class="mt-1 text-sm text-slate-500">Saved snapshots from printed or manually recorded reports.</p>
            </div>
          </div>

          <div v-if="reportRecords.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
            No saved report records yet. Use Save Record or Print Report to create one.
          </div>

          <div v-else class="mt-6 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
            <div class="space-y-4">
              <button
                v-for="record in reportRecords"
                :key="record.id"
                type="button"
                @click="selectedReportRecordId = record.id"
                :class="[
                  'w-full rounded-2xl border p-5 text-left transition',
                  selectedReportRecordId === record.id
                    ? 'border-sky-200 bg-sky-50 shadow-lg shadow-sky-100/70'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                ]"
              >
                <p class="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Report Record</p>
                <p class="mt-2 text-lg font-black text-slate-900">{{ formatDateTime(record.generatedAt) }}</p>
                <p class="mt-2 text-sm text-slate-500">{{ record.reportWindow }}</p>
                <p class="mt-3 text-sm font-semibold text-slate-700">{{ record.entryCount }} entries | Net {{ formatCurrency(record.totals.net) }}</p>
              </button>
            </div>

            <article v-if="selectedReportRecord" class="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-lg shadow-slate-200/60">
              <p class="text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Selected Record</p>
              <h3 class="mt-2 text-2xl font-black text-slate-900">{{ formatDateTime(selectedReportRecord.generatedAt) }}</h3>
              <p class="mt-2 text-sm text-slate-500">Coverage: {{ selectedReportRecord.reportWindow }}</p>

              <div class="mt-6 grid gap-4 sm:grid-cols-2">
                <div class="rounded-2xl bg-slate-50 p-4">
                  <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Revenue</p>
                  <p class="mt-2 text-2xl font-black text-slate-950">{{ formatCurrency(selectedReportRecord.totals.revenue) }}</p>
                </div>
                <div class="rounded-2xl bg-slate-50 p-4">
                  <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Expenses</p>
                  <p class="mt-2 text-2xl font-black text-slate-950">{{ formatCurrency(selectedReportRecord.totals.expenses) }}</p>
                </div>
                <div class="rounded-2xl bg-slate-50 p-4">
                  <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Net</p>
                  <p class="mt-2 text-2xl font-black text-slate-950">{{ formatCurrency(selectedReportRecord.totals.net) }}</p>
                </div>
                <div class="rounded-2xl bg-slate-50 p-4">
                  <p class="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Top Category</p>
                  <p class="mt-2 text-lg font-black text-slate-950">{{ selectedReportRecord.topCategory }}</p>
                </div>
              </div>

              <div class="mt-6 grid gap-4 md:grid-cols-2">
                <div class="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p class="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Receivables</p>
                  <p class="mt-2 text-2xl font-black text-slate-950">{{ formatCurrency(selectedReportRecord.totals.receivables) }}</p>
                </div>
                <div class="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p class="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Payables</p>
                  <p class="mt-2 text-2xl font-black text-slate-950">{{ formatCurrency(selectedReportRecord.totals.payables) }}</p>
                </div>
              </div>

              <p class="mt-6 text-sm font-semibold text-slate-600">
                This record was generated from {{ selectedReportRecord.entryCount }} transactions.
              </p>
            </article>
          </div>
        </section>

        <section class="report-shell rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-xl font-black text-slate-900">Report Ledger</h2>
              <p class="mt-1 text-sm text-slate-500">Detailed entries behind the summary cards above.</p>
            </div>
          </div>

          <div v-if="transactions.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
            No transaction data yet. Visit the transactions page to start recording activity.
          </div>

          <div v-else class="mt-6 overflow-x-auto">
            <table class="min-w-full border-separate border-spacing-y-3">
              <thead>
                <tr class="text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <th class="px-4">Date</th>
                  <th class="px-4">Party</th>
                  <th class="px-4">Category</th>
                  <th class="px-4">Type</th>
                  <th class="px-4">Amount</th>
                  <th class="px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in transactions" :key="item.transaction_id" class="rounded-2xl bg-slate-50 text-sm text-slate-600 shadow-sm shadow-slate-200/60">
                  <td class="rounded-l-2xl px-4 py-4">{{ formatDate(item.transaction_date) }}</td>
                  <td class="px-4 py-4 font-bold text-slate-900">{{ item.party_name }}</td>
                  <td class="px-4 py-4">{{ item.category || 'Uncategorized' }}</td>
                  <td class="px-4 py-4">
                    <span :class="['inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', typeStyles[item.entry_type] || 'bg-slate-100 text-slate-700']">
                      {{ item.entry_type }}
                    </span>
                  </td>
                  <td class="px-4 py-4 font-bold text-slate-900">{{ formatCurrency(item.amount) }}</td>
                  <td class="rounded-r-2xl px-4 py-4">
                    <span :class="['inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[item.status] || 'bg-slate-100 text-slate-700']">
                      {{ item.status }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap");

@media print {
  :global(body) {
    background: white !important;
  }

  .print-hidden {
    display: none !important;
  }

  .report-shell {
    break-inside: avoid;
    box-shadow: none !important;
    border-color: #dbeafe !important;
  }
}
</style>
