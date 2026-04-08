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
const isSubmitting = ref(false);
const isFormModalOpen = ref(false);
const selectedComparisonYear = ref(new Date().getFullYear());
const errorMessage = ref('');
const successMessage = ref('');

const typeStyles = {
  Revenue: 'bg-emerald-50 text-emerald-700',
  Expense: 'bg-rose-50 text-rose-700',
  Receivable: 'bg-blue-50 text-blue-700',
  Payable: 'bg-amber-50 text-amber-700'
};

const statusStyles = {
  Cleared: 'bg-emerald-50 text-emerald-600',
  Processed: 'bg-emerald-50 text-emerald-600',
  Pending: 'bg-slate-100 text-slate-600',
  Scheduled: 'bg-amber-50 text-amber-600',
  Overdue: 'bg-rose-50 text-rose-600',
  'Due Soon': 'bg-amber-50 text-amber-600',
  Open: 'bg-blue-50 text-blue-600',
  Urgent: 'bg-rose-50 text-rose-600',
  Upcoming: 'bg-blue-50 text-blue-600'
};

const form = ref({
  partyName: '',
  category: '',
  entryType: 'Revenue',
  amount: '',
  paymentMethod: 'Bank Transfer',
  transactionDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  status: 'Cleared',
  notes: ''
});

const resetForm = () => {
  form.value = {
    partyName: '',
    category: '',
    entryType: 'Revenue',
    amount: '',
    paymentMethod: 'Bank Transfer',
    transactionDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    status: 'Cleared',
    notes: ''
  };
};

const openFormModal = () => {
  errorMessage.value = '';
  successMessage.value = '';
  isFormModalOpen.value = true;
};

const closeFormModal = () => {
  isFormModalOpen.value = false;
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
    return 'No due date';
  }

  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
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

const summaryCards = computed(() => [
  {
    label: 'Revenue This Month',
    value: formatCurrency(transactionSummary.value.revenue),
    change: `${transactions.value.filter((item) => item.entry_type === 'Revenue').length} revenue entries`,
    icon: 'trending_up',
    tone: 'border-emerald-100 bg-emerald-50 text-emerald-600'
  },
  {
    label: 'Expenses This Month',
    value: formatCurrency(transactionSummary.value.expenses),
    change: `${transactions.value.filter((item) => item.entry_type === 'Expense').length} expense entries`,
    icon: 'payments',
    tone: 'border-rose-100 bg-rose-50 text-rose-600'
  },
  {
    label: 'Accounts Receivable',
    value: formatCurrency(transactionSummary.value.receivables),
    change: `${transactions.value.filter((item) => item.entry_type === 'Receivable').length} outstanding balances`,
    icon: 'receipt_long',
    tone: 'border-blue-100 bg-blue-50 text-blue-600'
  },
  {
    label: 'Accounts Payable',
    value: formatCurrency(transactionSummary.value.payables),
    change: `${transactions.value.filter((item) => item.entry_type === 'Payable').length} supplier obligations`,
    icon: 'account_balance',
    tone: 'border-amber-100 bg-amber-50 text-amber-600'
  }
]);

const receivables = computed(() =>
  transactions.value.filter((item) => item.entry_type === 'Receivable')
);

const payables = computed(() =>
  transactions.value.filter((item) => item.entry_type === 'Payable')
);

const insightCards = computed(() => [
  {
    label: 'Net Position',
    value: formatCurrency(transactionSummary.value.revenue - transactionSummary.value.expenses),
    tone: 'rounded-2xl bg-slate-950 p-5 text-white'
  },
  {
    label: 'Collections to Chase',
    value: `${receivables.value.filter((item) => ['Overdue', 'Due Soon', 'Pending'].includes(item.status)).length} records`,
    tone: 'rounded-2xl border border-blue-100 bg-blue-50 p-5'
  },
  {
    label: 'Bills Requiring Attention',
    value: `${payables.value.filter((item) => ['Urgent', 'Due Soon', 'Pending'].includes(item.status)).length} records`,
    tone: 'rounded-2xl border border-amber-100 bg-amber-50 p-5'
  }
]);

const yearlySummaries = computed(() => {
  const summaries = new Map();

  transactions.value.forEach((item) => {
    const date = item.transaction_date ? new Date(item.transaction_date) : null;
    const year = date && !Number.isNaN(date.getTime()) ? date.getFullYear() : new Date().getFullYear();

    if (!summaries.has(year)) {
      summaries.set(year, {
        year,
        revenue: 0,
        expenses: 0,
        receivables: 0,
        payables: 0,
        count: 0
      });
    }

    const summary = summaries.get(year);
    const amount = Number(item.amount || 0);

    summary.count += 1;

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
  });

  return Array.from(summaries.values())
    .map((item) => ({
      ...item,
      net: item.revenue - item.expenses
    }))
    .sort((a, b) => b.year - a.year);
});

const availableYears = computed(() => yearlySummaries.value.map((item) => item.year));

const selectedYearSummary = computed(() =>
  yearlySummaries.value.find((item) => item.year === Number(selectedComparisonYear.value)) || {
    year: Number(selectedComparisonYear.value),
    revenue: 0,
    expenses: 0,
    receivables: 0,
    payables: 0,
    count: 0,
    net: 0
  }
);

const previousYearSummary = computed(() =>
  yearlySummaries.value.find((item) => item.year === Number(selectedComparisonYear.value) - 1) || {
    year: Number(selectedComparisonYear.value) - 1,
    revenue: 0,
    expenses: 0,
    receivables: 0,
    payables: 0,
    count: 0,
    net: 0
  }
);

const formatDelta = (current, previous) => {
  const delta = Number(current || 0) - Number(previous || 0);
  const direction = delta > 0 ? '+' : delta < 0 ? '-' : '';
  return `${direction}${formatCurrency(Math.abs(delta))}`;
};

const yearlyComparisonCards = computed(() => [
  {
    label: 'Revenue',
    current: formatCurrency(selectedYearSummary.value.revenue),
    previous: formatCurrency(previousYearSummary.value.revenue),
    delta: formatDelta(selectedYearSummary.value.revenue, previousYearSummary.value.revenue),
    tone: 'border-emerald-100 bg-emerald-50 text-emerald-700'
  },
  {
    label: 'Expenses',
    current: formatCurrency(selectedYearSummary.value.expenses),
    previous: formatCurrency(previousYearSummary.value.expenses),
    delta: formatDelta(selectedYearSummary.value.expenses, previousYearSummary.value.expenses),
    tone: 'border-rose-100 bg-rose-50 text-rose-700'
  },
  {
    label: 'Net Position',
    current: formatCurrency(selectedYearSummary.value.net),
    previous: formatCurrency(previousYearSummary.value.net),
    delta: formatDelta(selectedYearSummary.value.net, previousYearSummary.value.net),
    tone: 'border-blue-100 bg-blue-50 text-blue-700'
  },
  {
    label: 'Ledger Activity',
    current: `${selectedYearSummary.value.count} entries`,
    previous: `${previousYearSummary.value.count} entries`,
    delta: `${selectedYearSummary.value.count - previousYearSummary.value.count > 0 ? '+' : ''}${selectedYearSummary.value.count - previousYearSummary.value.count} entries`,
    tone: 'border-amber-100 bg-amber-50 text-amber-700'
  }
]);

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
      throw new Error(data.error || 'Could not load transactions.');
    }

    transactions.value = data;
    if (data.length > 0) {
      const years = data
        .map((item) => new Date(item.transaction_date).getFullYear())
        .filter((year) => !Number.isNaN(year))
        .sort((a, b) => b - a);

      if (!years.includes(Number(selectedComparisonYear.value))) {
        selectedComparisonYear.value = years[0];
      }
    }
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isLoading.value = false;
  }
};

const createTransaction = async () => {
  if (!currentUser.value?.user_id) {
    return;
  }

  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const response = await fetch(`${API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: currentUser.value.user_id,
        partyName: form.value.partyName.trim(),
        category: form.value.category.trim(),
        entryType: form.value.entryType,
        amount: Number(form.value.amount),
        paymentMethod: form.value.paymentMethod.trim(),
        transactionDate: form.value.transactionDate,
        dueDate: form.value.dueDate || null,
        status: form.value.status,
        notes: form.value.notes.trim()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Could not create transaction.');
    }

    transactions.value = [data, ...transactions.value];
    successMessage.value = 'Transaction saved successfully.';
    resetForm();
    closeFormModal();
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSubmitting.value = false;
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
      'min-h-screen bg-[radial gradient(circle at_top,_rgba(59,130,246,0.10),_transparent_32%),linear-gradient(to_bottom,_#f8fbff,_#f8fafc)] p-4 transition-[margin] duration-300 lg:p-8',
      isSidebarExpanded ? 'ml-72' : 'ml-24'
    ]"
  >
    <div class="mx-auto max-w-7xl">
      <section class="mb-8 rounded-4xl border border-slate-200 bg-white/90 p-8 shadow-xl shadow-slate-200 backdrop-blur-sm">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">Transactions</p>
            <h1 class="mt-2 text-3xl font-black text-slate-900">Revenue, Expenses, Debts, and Ledger</h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              Track incoming money, outgoing costs, customer balances, supplier obligations, and every transaction in one place.
            </p>
            <p class="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              {{ exchangeRateNote }}
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <div class="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p class="text-xs font-bold uppercase tracking-[0.22em] text-blue-500">Ledger Entries</p>
              <p class="mt-1 text-2xl font-black text-slate-900">{{ transactions.length }}</p>
            </div>
            <button @click="openFormModal" class="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700">
              New Transaction
            </button>
            <button @click="logout" class="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Log out
            </button>
          </div>
        </div>
      </section>

      <section class="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <article
          v-for="card in summaryCards"
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

      <section class="mb-6 rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="text-xl font-black text-slate-900">Previous Year Comparison</h2>
            <p class="mt-1 text-sm text-slate-500">Compare any available year with the year immediately before it.</p>
          </div>

          <div class="flex items-center gap-3">
            <label class="text-sm font-semibold text-slate-700">Base Year</label>
            <select v-model="selectedComparisonYear" class="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50">
              <option v-for="year in availableYears" :key="year" :value="year">
                {{ year }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="availableYears.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
          Add transactions with dates to unlock year-over-year comparisons.
        </div>

        <template v-else>
          <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article v-for="card in yearlyComparisonCards" :key="card.label" class="rounded-[1.5rem] border border-slate-200 p-5" :class="card.tone">
              <p class="text-xs font-bold uppercase tracking-[0.2em]">{{ card.label }}</p>
              <p class="mt-3 text-2xl font-black">{{ card.current }}</p>
              <p class="mt-2 text-sm font-semibold text-slate-600">{{ selectedYearSummary.year }} vs {{ previousYearSummary.year }}</p>
              <p class="mt-1 text-sm text-slate-600">Previous: {{ card.previous }}</p>
              <p class="mt-3 text-sm font-bold">Change: {{ card.delta }}</p>
            </article>
          </div>

          <div class="mt-6 overflow-x-auto">
            <table class="min-w-full border-separate border-spacing-y-3">
              <thead>
                <tr class="text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <th class="px-4">Year</th>
                  <th class="px-4">Revenue</th>
                  <th class="px-4">Expenses</th>
                  <th class="px-4">Net</th>
                  <th class="px-4">Receivables</th>
                  <th class="px-4">Payables</th>
                  <th class="px-4">Entries</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in yearlySummaries" :key="item.year" class="rounded-2xl bg-slate-50 text-sm text-slate-600 shadow-sm shadow-slate-200/60">
                  <td class="rounded-l-2xl px-4 py-4 font-bold text-slate-900">{{ item.year }}</td>
                  <td class="px-4 py-4">{{ formatCurrency(item.revenue) }}</td>
                  <td class="px-4 py-4">{{ formatCurrency(item.expenses) }}</td>
                  <td class="px-4 py-4 font-bold text-slate-900">{{ formatCurrency(item.net) }}</td>
                  <td class="px-4 py-4">{{ formatCurrency(item.receivables) }}</td>
                  <td class="px-4 py-4">{{ formatCurrency(item.payables) }}</td>
                  <td class="rounded-r-2xl px-4 py-4">{{ item.count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>

      <section class="mb-6 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-slate-900">Record Transaction</h2>
              <p class="mt-1 text-sm text-slate-500">Open the modal to create a new revenue, expense, receivable, or payable entry.</p>
            </div>
            <div class="flex flex-wrap gap-3">
              <button @click="openFormModal" class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700">
                Open Form
              </button>
              <button @click="loadTransactions" class="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                Refresh
              </button>
            </div>
          </div>
          <div class="mt-6 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <p class="text-sm font-semibold text-slate-700">The transaction form now opens in a modal.</p>
            <p class="mt-2 text-sm text-slate-500">Use the button above whenever you want to add a new ledger entry.</p>
          </div>

          <p v-if="successMessage" class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {{ successMessage }}
          </p>
        </article>

        <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <h2 class="text-xl font-black text-slate-900">Quick Insight</h2>
          <p class="mt-1 text-sm text-slate-500">Useful signals for short-term cashflow management.</p>

          <div class="mt-6 space-y-4">
            <div v-for="item in insightCards" :key="item.label" :class="item.tone">
              <p :class="item.tone.includes('bg-slate-950') ? 'text-xs font-bold uppercase tracking-[0.2em] text-slate-400' : 'text-xs font-bold uppercase tracking-[0.2em] text-slate-500'">
                {{ item.label }}
              </p>
              <p :class="item.tone.includes('bg-slate-950') ? 'mt-2 text-3xl font-black text-white' : 'mt-2 text-3xl font-black text-slate-950'">
                {{ item.value }}
              </p>
            </div>
          </div>

          <div class="mt-6 rounded-[1.5rem] bg-blue-600 p-5 text-white shadow-lg shadow-blue-600/20">
            <p class="text-xs font-bold uppercase tracking-[0.24em] text-blue-100">Working Advice</p>
            <p class="mt-3 text-sm leading-6 text-blue-50">
              Use receivables for money owed to the business and payables for money the business still needs to pay.
            </p>
          </div>
        </article>
      </section>

      <section class="mb-6 grid gap-6 lg:grid-cols-2">
        <article class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-black text-slate-900">Money Owed To You</h2>
              <p class="mt-1 text-sm text-slate-500">Outstanding customer balances and expected collections.</p>
            </div>
            <span class="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Receivables</span>
          </div>

          <div v-if="receivables.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
            No receivables yet. Create one from the transaction modal.
          </div>

          <div v-else class="mt-6 space-y-4">
            <article v-for="item in receivables" :key="item.transaction_id" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-lg font-bold text-slate-900">{{ item.party_name }}</p>
                  <p class="mt-1 text-sm text-slate-500">Due {{ formatDate(item.due_date) }}</p>
                </div>
                <div class="text-left sm:text-right">
                  <p class="text-xl font-black text-slate-950">{{ formatCurrency(item.amount) }}</p>
                  <span :class="['mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[item.status] || 'bg-slate-100 text-slate-600']">
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
              <h2 class="text-xl font-black text-slate-900">Money You Owe</h2>
              <p class="mt-1 text-sm text-slate-500">Supplier bills and business obligations that still need settlement.</p>
            </div>
            <span class="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-600">Payables</span>
          </div>

          <div v-if="payables.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
            No payables yet. Create one from the transaction modal.
          </div>

          <div v-else class="mt-6 space-y-4">
            <article v-for="item in payables" :key="item.transaction_id" class="rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p class="text-lg font-bold text-slate-900">{{ item.party_name }}</p>
                  <p class="mt-1 text-sm text-slate-500">Due {{ formatDate(item.due_date) }}</p>
                </div>
                <div class="text-left sm:text-right">
                  <p class="text-xl font-black text-slate-950">{{ formatCurrency(item.amount) }}</p>
                  <span :class="['mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', statusStyles[item.status] || 'bg-slate-100 text-slate-600']">
                    {{ item.status }}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </article>
      </section>

      <section class="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-xl font-black text-slate-900">Transaction Records</h2>
            <p class="mt-1 text-sm text-slate-500">A live ledger of revenue, expenses, receivables, and payables.</p>
          </div>
        </div>

        <div v-if="isLoading" class="mt-6 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-8 text-sm font-medium text-slate-500">
          Loading transactions...
        </div>

        <div v-else-if="transactions.length === 0" class="mt-6 rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm font-medium text-slate-500">
          No transaction records yet. Add your first one from the transaction modal.
        </div>

        <div v-else class="mt-6 overflow-x-auto">
          <table class="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr class="text-left text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                <th class="px-4">Ref</th>
                <th class="px-4">Date</th>
                <th class="px-4">Party</th>
                <th class="px-4">Category</th>
                <th class="px-4">Type</th>
                <th class="px-4">Amount</th>
                <th class="px-4">Method</th>
                <th class="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in transactions" :key="item.transaction_id" class="rounded-2xl bg-slate-50 text-sm text-slate-600 shadow-sm shadow-slate-200/60">
                <td class="rounded-l-2xl px-4 py-4 font-bold text-slate-900">TXN-{{ item.transaction_id }}</td>
                <td class="px-4 py-4">{{ formatDate(item.transaction_date) }}</td>
                <td class="px-4 py-4">{{ item.party_name }}</td>
                <td class="px-4 py-4">{{ item.category }}</td>
                <td class="px-4 py-4">
                  <span :class="['inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', typeStyles[item.entry_type]]">
                    {{ item.entry_type }}
                  </span>
                </td>
                <td class="px-4 py-4 font-bold text-slate-900">{{ formatCurrency(item.amount) }}</td>
                <td class="px-4 py-4">{{ item.payment_method || 'N/A' }}</td>
                <td class="rounded-r-2xl px-4 py-4">{{ item.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>

  <teleport to="body">
    <div
      v-if="isFormModalOpen"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      @click.self="closeFormModal"
    >
      <div class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-950/20">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold uppercase tracking-[0.25em] text-blue-600">New Transaction</p>
            <h2 class="mt-2 text-2xl font-black text-slate-900">Record a ledger entry</h2>
            <p class="mt-2 text-sm text-slate-500">Capture revenue, expenses, receivables, and payables without leaving the page.</p>
          </div>
          <button @click="closeFormModal" class="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
            Close
          </button>
        </div>

        <form class="mt-6 space-y-4" @submit.prevent="createTransaction">
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Party Name</label>
              <input v-model="form.partyName" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="Client or vendor">
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Category</label>
              <input v-model="form.category" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="Utilities, Invoice, Salary">
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Type</label>
              <select v-model="form.entryType" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50">
                <option>Revenue</option>
                <option>Expense</option>
                <option>Receivable</option>
                <option>Payable</option>
              </select>
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Amount</label>
              <input v-model="form.amount" type="number" min="0" step="0.01" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="0.00">
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Method</label>
              <input v-model="form.paymentMethod" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="Bank Transfer">
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Status</label>
              <select v-model="form.status" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50">
                <option>Cleared</option>
                <option>Processed</option>
                <option>Pending</option>
                <option>Scheduled</option>
                <option>Overdue</option>
                <option>Due Soon</option>
                <option>Open</option>
                <option>Urgent</option>
                <option>Upcoming</option>
              </select>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Transaction Date</label>
              <input v-model="form.transactionDate" type="date" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50">
            </div>
            <div>
              <label class="mb-1.5 block text-sm font-semibold text-slate-800">Due Date</label>
              <input v-model="form.dueDate" type="date" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50">
            </div>
          </div>

          <div>
            <label class="mb-1.5 block text-sm font-semibold text-slate-800">Notes</label>
            <textarea v-model="form.notes" rows="3" class="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-50" placeholder="Optional bookkeeping note"></textarea>
          </div>

          <p v-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {{ errorMessage }}
          </p>

          <p v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {{ successMessage }}
          </p>

          <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" @click="closeFormModal" class="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
              Cancel
            </button>
            <button :disabled="!form.partyName.trim() || !form.category.trim() || !form.amount || isSubmitting" class="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {{ isSubmitting ? 'Saving...' : 'Save Transaction' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap");
</style>
