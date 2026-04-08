<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { supabase } from '@/lib/supabase';
import { syncAuthenticatedUser } from '@/utils/auth-session';

const inputStyles = "w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-600 transition-all placeholder:text-slate-300";
const labelStyles = "block text-sm font-semibold text-slate-800 mb-1.5";

const accountType = ref('business');
const showPassword = ref(false);
const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const router = useRouter();

const form = ref({
  businessName: '',
  businessType: 'ltd',
  fullName: '',
  city: '',
  phone: '',
  email: '',
  password: ''
});

const isSignupValid = computed(() => {
  const shared = form.value.email.includes('@') && form.value.password.length >= 8;

  if (accountType.value === 'business') {
    return shared && form.value.businessName.trim() && form.value.businessType;
  }

  return shared && form.value.fullName.trim() && form.value.city.trim() && form.value.phone.trim();
});

const togglePassword = () => {
  showPassword.value = !showPassword.value;
};

const submitSignup = async () => {
  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    if (!supabase) {
      throw new Error('Supabase is not configured. Add your Supabase URL and publishable key.');
    }

    const signupMetadata = accountType.value === 'business'
      ? {
          account_type: 'business',
          business_name: form.value.businessName.trim(),
          business_type: form.value.businessType
        }
      : {
          account_type: 'client',
          full_name: form.value.fullName.trim(),
          city: form.value.city.trim(),
          phone: form.value.phone.trim()
        };

    const { data, error } = await supabase.auth.signUp({
      email: form.value.email.trim(),
      password: form.value.password,
      options: {
        data: signupMetadata
      }
    });

    if (error) {
      throw error;
    }

    if (data.session?.access_token) {
      await syncAuthenticatedUser(data.session.access_token);
      successMessage.value = 'Account created successfully. Redirecting to your dashboard...';

      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
      return;
    }

    successMessage.value = 'Account created. Check your email to confirm your address, then log in.';

    setTimeout(() => {
      router.push('/login');
    }, 1400);
  } catch (error) {
    errorMessage.value = error.message;
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4 lg:p-8 font-sans antialiased">
    <div
      class="w-full max-w-6xl bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 flex overflow-hidden min-h-187.5">
      <div class="hidden lg:block w-[45%] relative">
        <img src="@/assets/business.jpg" class="absolute inset-0 w-full h-full object-cover"
          alt="Business background" />
        <div class="absolute top-10 left-10">
          <div
            class="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
            <span class="text-white font-black text-2xl italic tracking-tighter">F</span>
          </div>
        </div>
        <div class="absolute bottom-12 left-10 right-10">
          <p class="text-white/70 text-sm font-medium mb-2">Create your account</p>
          <h2 class="text-white text-3xl font-bold leading-tight">
            Start your financial journey with us.
          </h2>
        </div>
      </div>

      <div class="w-full lg:w-[55%] p-8 lg:p-16 flex flex-col">
        <div class="flex justify-end items-center mb-12">
          <div class="flex items-center gap-3">
            <span class="text-[11px] font-black uppercase tracking-widest text-slate-400">Quick Signup</span>
            <div class="h-1.5 w-8 rounded-full bg-blue-600"></div>
          </div>
        </div>

        <div class="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
          <div class="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 class="text-3xl font-black text-slate-900 mb-2 tracking-tight">Create Account</h1>
            <p class="text-slate-500 text-sm mb-8 font-medium">Choose how you'd like to use FinFlow and start right
              away.</p>

            <div class="flex p-1 bg-slate-50 border border-slate-100 rounded-xl mb-8">
              <button @click="accountType = 'business'"
                :class="accountType === 'business' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'"
                class="flex-1 py-2.5 font-bold rounded-lg transition-all text-xs uppercase tracking-wider">Business</button>
              <button @click="accountType = 'client'"
                :class="accountType === 'client' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400'"
                class="flex-1 py-2.5 font-bold rounded-lg transition-all text-xs uppercase tracking-wider">Client</button>
            </div>

            <form @submit.prevent="submitSignup" class="space-y-4">
              <div v-if="accountType === 'business'" class="space-y-4">
                <div>
                  <label :class="labelStyles">Business Name</label>
                  <input v-model="form.businessName" :class="inputStyles" placeholder="e.g. Acme Corp">
                </div>
                <div>
                  <label :class="labelStyles">Business Type</label>
                  <select v-model="form.businessType" :class="inputStyles">
                    <option value="ltd">Limited Company</option>
                    <option value="sole">Sole Proprietorship</option>
                  </select>
                </div>
              </div>

              <div v-else class="space-y-4">
                <div>
                  <label :class="labelStyles">Full Name</label>
                  <input v-model="form.fullName" :class="inputStyles" placeholder="John Doe">
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label :class="labelStyles">City</label>
                    <input v-model="form.city" :class="inputStyles" placeholder="Accra">
                  </div>
                  <div>
                    <label :class="labelStyles">Phone</label>
                    <input v-model="form.phone" :class="inputStyles" placeholder="+233...">
                  </div>
                </div>
              </div>

              <div class="pt-4 border-t border-slate-50 space-y-4">
                <div>
                  <label :class="labelStyles">Email Address</label>
                  <input v-model="form.email" type="email" :class="inputStyles" placeholder="name@company.com">
                </div>
                <div>
                  <label :class="labelStyles">Password</label>
                  <div class="relative">
                    <input v-model="form.password" :type="showPassword ? 'text' : 'password'" :class="inputStyles"
                      placeholder="........">
                    <button @click="togglePassword" type="button"
                      class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-600 transition-colors">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-width="2" />
                        <path
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          stroke-width="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <p v-if="errorMessage"
                class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {{ errorMessage }}
              </p>

              <p v-if="successMessage"
                class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {{ successMessage }}
              </p>

              <button :disabled="!isSignupValid || isSubmitting"
                class="w-full py-4 rounded-xl font-bold text-sm transition-all mt-4 disabled:shadow-none"
                :class="isSignupValid && !isSubmitting ? 'bg-blue-600 text-white shadow-xl shadow-blue-100 hover:bg-blue-700' : 'bg-slate-100 text-slate-300 cursor-not-allowed'">
                {{ isSubmitting ? 'Creating Account...' : 'Create Account' }}
              </button>
            </form>
          </div>
        </div>

        <div class="mt-auto text-center pt-8">
          <p class="text-xs text-slate-400">Already have an account? <router-link to="/login"
              class="text-blue-600 font-bold hover:underline">Log in</router-link></p>
        </div>
      </div>
    </div>
  </div>
</template>
