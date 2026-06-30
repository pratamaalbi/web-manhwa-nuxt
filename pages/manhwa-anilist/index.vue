<script setup>
import { ref, computed } from 'vue'

const currentPage = ref(1)

const { data, pending, error, refresh } = await useFetch('/api/anilist/manhwa', {
  query: { page: currentPage, perPage: 16 },
  watch: [currentPage]
})

const manhwaList = computed(() => data.value?.Page?.media || [])
const pageInfo   = computed(() => data.value?.Page?.pageInfo || {})

const nextPage = () => {
  if (pageInfo.value.hasNextPage) {
    currentPage.value++
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// Translation
const translatingIds         = ref(new Set())
const translatedDescriptions = ref({})

const translateDescription = async (id, text) => {
  if (!text || translatedDescriptions.value[id]) return
  translatingIds.value = new Set([...translatingIds.value, id])
  try {
    const res = await $fetch('/api/translate', { method: 'POST', body: { text } })
    translatedDescriptions.value = { ...translatedDescriptions.value, [id]: res.translatedText }
  } catch (err) {
    console.error('Translate error:', err)
  } finally {
    const next = new Set(translatingIds.value)
    next.delete(id)
    translatingIds.value = next
  }
}

const getStatusColor = (status) => {
  const map = {
    RELEASING: 'bg-[#00adb5]/90 text-white',
    FINISHED:  'bg-emerald-500/90 text-white',
    HIATUS:    'bg-amber-500/90 text-white',
    CANCELLED: 'bg-red-500/90 text-white'
  }
  return map[status] || 'bg-gray-500/90 text-white'
}

const cleanHtml = (html) => {
  if (!html) return 'Tidak ada deskripsi.'
  return html.replace(/<[^>]*>?/gm, '')
}
</script>

<template>
  <div class="bg-[#121212] text-[#e5e2e1] min-h-screen font-sans overflow-x-hidden selection:bg-[#55d8e1]/30 selection:text-[#55d8e1]">

    <!-- Navbar -->
    <nav class="fixed top-0 w-full z-50 bg-[#131313]/90 backdrop-blur-md flex justify-between items-center px-6 py-3 max-w-full border-b border-white/5">
      <h1 class="text-2xl font-black text-[#55d8e1] tracking-wider cursor-pointer select-none" @click="navigateTo('/')">MangaStream</h1>
      <div class="flex items-center gap-6">
        <NuxtLink to="/" class="text-gray-400 hover:text-white transition-colors text-sm font-semibold">Home</NuxtLink>
        <NuxtLink to="/manhwa-anilist" class="text-[#55d8e1] text-sm font-bold border-b-2 border-[#55d8e1] pb-1">AniList Manhwa</NuxtLink>
      </div>
    </nav>

    <main class="w-full max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-12 min-h-screen">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h2 class="text-3xl font-black text-white flex items-center gap-3">
            <span class="w-2 h-10 bg-gradient-to-b from-[#55d8e1] to-[#00adb5] rounded-full"></span>
            Top Manhwa Korea
          </h2>
          <p class="text-gray-500 mt-1 text-sm ml-5">Powered by AniList GraphQL API</p>
        </div>
        <div class="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-xl text-violet-300 text-xs font-medium">
          <span class="material-symbols-outlined text-[16px]">info</span>
          Klik card untuk melihat detail & link baca resmi
        </div>
      </div>

      <!-- Loading -->
      <div v-if="pending" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div v-for="i in 16" :key="i" class="skeleton h-[460px] rounded-2xl"></div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="bg-red-950/20 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
        <span class="material-symbols-outlined text-3xl block mb-2">error</span>
        <p>{{ error.statusMessage || error.message || 'Gagal memuat data dari AniList.' }}</p>
        <button @click="refresh" class="mt-4 px-4 py-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors">Coba Lagi</button>
      </div>

      <!-- Grid -->
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div
          v-for="manga in manhwaList"
          :key="manga.id"
          class="bg-[#1e1e1e] border border-white/5 rounded-2xl overflow-hidden group hover:shadow-[0_8px_30px_rgba(0,173,181,0.12)] hover:-translate-y-1 transition-all duration-300 flex flex-col cursor-pointer"
          @click="navigateTo(`/manhwa-anilist/${manga.id}`)"
        >
          <!-- Cover -->
          <div class="relative h-64 overflow-hidden bg-black/50 shrink-0">
            <img
              :src="manga.coverImage?.large"
              :alt="manga.title?.userPreferred || manga.title?.english"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90 group-hover:opacity-100"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] via-[#1e1e1e]/20 to-transparent"></div>

            <!-- Hover overlay -->
            <div class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div class="flex flex-col items-center gap-1">
                <span class="material-symbols-outlined text-4xl text-[#55d8e1]">open_in_new</span>
                <span class="text-white text-sm font-bold">Lihat Detail</span>
              </div>
            </div>

            <!-- Status -->
            <div class="absolute top-3 left-3 z-10">
              <span class="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide backdrop-blur-sm shadow-sm" :class="getStatusColor(manga.status)">
                {{ manga.status || 'UNKNOWN' }}
              </span>
            </div>
            <!-- Score -->
            <div class="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 border border-white/10">
              <span class="material-symbols-outlined text-yellow-400 text-[14px]">star</span>
              <span class="text-white font-bold text-xs">{{ manga.averageScore ? manga.averageScore + '%' : 'N/A' }}</span>
            </div>
          </div>

          <!-- Card Body -->
          <div class="p-5 flex-1 flex flex-col">
            <h3 class="text-base font-bold text-white mb-2 line-clamp-2 leading-tight group-hover:text-[#55d8e1] transition-colors">
              {{ manga.title?.english || manga.title?.userPreferred }}
            </h3>

            <div class="flex-1">
              <p class="text-sm text-gray-400 line-clamp-3 leading-relaxed">
                {{ translatedDescriptions[manga.id] || cleanHtml(manga.description) }}
              </p>
            </div>

            <!-- Actions -->
            <div class="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-2">
              <!-- Translate -->
              <button
                v-if="!translatedDescriptions[manga.id]"
                @click.stop="translateDescription(manga.id, cleanHtml(manga.description))"
                :disabled="translatingIds.has(manga.id) || !manga.description"
                class="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 flex-none"
                :class="manga.description ? 'bg-[#00adb5]/10 text-[#55d8e1] hover:bg-[#00adb5]/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'"
              >
                <span class="material-symbols-outlined text-[14px]" :class="translatingIds.has(manga.id) ? 'animate-spin' : ''">
                  {{ translatingIds.has(manga.id) ? 'sync' : 'translate' }}
                </span>
                {{ translatingIds.has(manga.id) ? 'Proses...' : (manga.description ? 'Terjemahkan' : 'No Desc') }}
              </button>
              <span v-else class="text-[11px] text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded-md flex-none">
                <span class="material-symbols-outlined text-[14px]">check_circle</span>
                Teks ID
              </span>

              <!-- Detail button -->
              <button
                @click.stop="navigateTo(`/manhwa-anilist/${manga.id}`)"
                class="flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-xs bg-[#00adb5] text-white hover:bg-[#55d8e1] shadow-md transition-all flex-none"
              >
                <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
                Detail
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="!pending && !error && pageInfo.total" class="mt-12 flex items-center justify-center gap-4">
        <button
          @click="prevPage"
          :disabled="currentPage === 1"
          class="flex items-center gap-2 px-5 py-2.5 bg-[#1e1e1e] border border-white/10 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2a2a2a] hover:text-[#55d8e1]"
        >
          <span class="material-symbols-outlined">chevron_left</span>
          Sebelumnya
        </button>

        <div class="px-6 py-2.5 bg-[#1a1a1a] rounded-xl font-bold text-[#55d8e1] border border-[#55d8e1]/30">
          Halaman {{ pageInfo.currentPage }}
        </div>

        <button
          @click="nextPage"
          :disabled="!pageInfo.hasNextPage"
          class="flex items-center gap-2 px-5 py-2.5 bg-[#1e1e1e] border border-white/10 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2a2a2a] hover:text-[#55d8e1]"
        >
          Selanjutnya
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #1e1e1e 25%, #2a2a2a 37%, #1e1e1e 63%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
