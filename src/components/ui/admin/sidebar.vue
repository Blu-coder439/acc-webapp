<template>
  <aside
    @mouseenter="setExpanded(true)"
    @mouseleave="setExpanded(false)"
    :class="[
      isExpanded ? 'w-72' : 'w-24',
      'fixed top-0 left-0 h-full bg-white/92 text-slate-700 backdrop-blur-xl border-r border-slate-200 px-3 py-6 transition-all duration-300 flex flex-col overflow-y-auto scrollbar-hide whitespace-nowrap z-50 shadow-2xl shadow-slate-950/8'
    ]"
  >
    <div class="mb-8 rounded-[1.75rem] border border-slate-200 bg-linear-to-br from-slate-50 via-white to-blue-50 p-3 shadow-lg shadow-slate-950/5">
      <div :class="['flex items-center', isExpanded ? 'gap-3' : 'justify-center']">
        <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-600/25">
          F
        </div>
        <div v-if="isExpanded" class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-600">Admin</p>
          <h2 class="text-xl font-black uppercase italic tracking-tighter text-slate-950">
            Fin<span class="text-blue-600">Flow</span>
          </h2>
        </div>
      </div>
    </div>

    <ul class="list-none space-y-1 text-sm font-semibold">
      <h4
        v-if="isExpanded"
        class="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400"
      >
        Menu
      </h4>

      <li class="mb-2">
        <button
          type="button"
          @click="$router.push('/')"
          class="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-slate-600 transition-all duration-200 hover:bg-blue-50 hover:text-blue-700"
        >
          <span class="grid min-w-10 place-items-center rounded-xl bg-slate-100 text-slate-500 transition-colors duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" class="h-5 w-5">
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 10v10h14V10" />
              <path d="M9 21V12h6v9" />
            </svg>
          </span>
          <span v-if="isExpanded" class="transition-opacity duration-300">Home</span>
        </button>
      </li>

      <li v-for="item in menuItems" :key="item.key" class="mb-2">
        <button
          type="button"
          @click="selectMenu(item)"
          :class="[
            'w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-300',
            selectedMenu === item.key
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
          ]"
        >
          <span
            :class="[
              'material-symbols-outlined min-w-10 rounded-xl px-2 py-2 text-center text-[22px] transition-all duration-300',
              selectedMenu === item.key
                ? 'bg-white/15 text-white'
                : 'bg-slate-100 text-slate-500'
            ]"
          >
            {{ item.icon }}
          </span>
          <span v-if="isExpanded" class="transition-opacity duration-300">
            {{ item.text }}
          </span>
        </button>
      </li>
    </ul>

    <div class="mt-auto border-t border-slate-200 pt-4">
      <button
        @click="selectSettings"
        :class="[
          'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition duration-300',
          selectedMenu === 'settings'
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
            : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
        ]"
      >
        <span
          :class="[
            'material-symbols-outlined min-w-10 rounded-xl px-2 py-2 text-center text-[22px]',
            selectedMenu === 'settings'
              ? 'bg-white/15 text-white'
              : 'bg-slate-100 text-slate-500'
          ]"
        >settings</span>
        <span v-if="isExpanded">Settings</span>
      </button>

      <button
        @click="signOut"
        class="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
      >
        <span class="material-symbols-outlined min-w-10 rounded-xl bg-rose-50 px-2 py-2 text-center text-[22px] text-rose-500">logout</span>
        <span v-if="isExpanded">Sign Out</span>
      </button>
    </div>
  </aside>
</template>

<script>
import { signOutCurrentUser } from '@/utils/auth-session';

export default {
  name: "AdminSidebar",
  emits: ["menuSelect", "toggle"],
  data() {
    return {
      isExpanded: false,
      selectedMenu: null,
      menuItems: [
        { key: "dashboard", text: "Dashboard", icon: "dashboard" },
        { key: "transactions", text: "Transactions", icon: "credit_card" },
        { key: "reports", text: "Reports", icon: "bar_chart" },
        { key: "profile", text: "Profile", icon: "account_circle" },
      ],
    };
  },
  watch: {
    '$route.name': {
      immediate: true,
      handler(name) {
        if (name === 'settings') {
          this.selectedMenu = 'settings';
          return;
        }

        const matchedItem = this.menuItems.find((item) => item.key === name);
        this.selectedMenu = matchedItem ? matchedItem.key : null;
      },
    },
  },
  methods: {
    setExpanded(expanded) {
      if (this.isExpanded === expanded) {
        return;
      }

      this.isExpanded = expanded;
      this.$emit("toggle", expanded);
    },
    selectMenu(item) {
      this.selectedMenu = item.key;
      this.$emit("menuSelect", item.key);

      const routeMap = {
        dashboard: '/dashboard',
        transactions: '/transactions',
        reports: '/reports',
        profile: '/profile',
      };

      if (routeMap[item.key] && this.$route.path !== routeMap[item.key]) {
        this.$router.push(routeMap[item.key]);
      }
    },
    selectSettings() {
      this.selectedMenu = 'settings';
      this.$emit("menuSelect", 'settings');

      if (this.$route.path !== '/settings') {
        this.$router.push('/settings');
      }
    },
    async signOut() {
      await signOutCurrentUser();
      this.$router.push("/login");
    },
  },
};
</script>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=swap");

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
