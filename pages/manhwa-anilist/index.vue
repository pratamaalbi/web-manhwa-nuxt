<script setup>
import { ref, computed } from 'vue'

const currentPage = ref(1)
const perPage = 16

const offset = computed(() => (currentPage.value - 1) * perPage)

// Client-side fetch untuk menghindari 403 Forbidden di Cloudflare Pages Serverless
const { data, pending, error, refresh } = await useFetch(() => `https://kitsu.io/api/edge/manga?filter[subtype]=manhwa&sort=-userCount&page[limit]=${perPage}&page[offset]=${offset.value}`, {
  server: false,
  headers: {
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json'
  }
})

const manhwaList = computed(() => data.value?.data || [])
const metaCount = computed(() => data.value?.meta?.count || 0)
const hasNextPage = computed(() => offset.value + perPage < metaCount.value)

const nextPage = () => {
  if (hasNextPage.value) {
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

const getStatusBadge = (status) => {
  const s = status?.toLowerCase()
  if (s === 'current' || s === 'releasing') return 'bg-emerald-500/90 text-white'
  if (s === 'finished') return 'bg-blue-500/90 text-white'
  if (s === 'tba' || s === 'upcoming') return 'bg-amber-500/90 text-white'
  if (s === 'unreleased') return 'bg-purple-500/90 text-white'
  return 'bg-gray-500/90 text-white'
}

const openWebtoon = (title) => {
  window.open(`https://www.webtoons.com/id/search?keyword=${encodeURIComponent(title)}`, '_blank')
}

const openGoogle = (title) => {
  window.open(`https://www.google.com/search?q=baca+manhwa+${encodeURIComponent(title)}+bahasa+indonesia`, '_blank')
}
</script>

<template>
  <div class="bg-[#121212] text-[#e5e2e1] min-h-screen font-sans overflow-x-hidden selection:bg-[#55d8e1]/30 selection:text-[#55d8e1]">
    <!-- Navbar -->
    <nav class="fixed top-0 w-full z-50 bg-[#131313]/90 backdrop-blur-md flex justify-between items-center px-6 py-3 max-w-full border-b border-white/5">
      <h1 class="text-2xl font-black text-[#55d8e1] tracking-wider cursor-pointer select-none" @click="navigateTo('/')">MangaStream</h1>
      <div class="flex items-center gap-6">
        <NuxtLink to="/" class="text-gray-400 hover:text-white transition-colors text-sm font-semibold">Home</NuxtLink>
        <NuxtLink to="/manhwa-anilist" class="text-[#55d8e1] text-sm font-bold border-b-2 border-[#55d8e1] pb-1">Katalog Manhwa</NuxtLink>
      </div>
    </nav>

    <main class="w-full max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-12 min-h-screen">
      <!-- Header -->
      <div class="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h2 class="text-3xl font-black text-white flex items-center gap-3">
            <span class="w-2 h-10 bg-gradient-to-b from-[#55d8e1] to-[#00adb5] rounded-full"></span>
            Top Manhwa (Kitsu)
          </h2>
          <p class="text-gray-500 mt-1 text-sm ml-5">Powered by Kitsu API (Client-side)</p>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div v-for="i in 6" :key="i" class="skeleton h-[380px] rounded-2xl"></div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="bg-red-950/20 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
        <span class="material-symbols-outlined text-3xl block mb-2">error</span>
        <p>Gagal memuat data dari Kitsu API.</p>
        <button @click="refresh" class="mt-4 px-4 py-2 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors">Coba Lagi</button>
      </div>

      <!-- Data Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div
          v-for="item in manhwaList"
          :key="item.id"
          class="bg-[#1e1e1e] border border-white/5 rounded-2xl overflow-hidden group hover:shadow-[0_8px_30px_rgba(0,173,181,0.12)] hover:-translate-y-1 transition-all duration-300 flex flex-col h-full"
        >
          <div class="flex flex-col sm:flex-row h-full">
            <!-- Poster -->
            <div class="relative w-full sm:w-2/5 h-64 sm:h-auto shrink-0 bg-black/50 overflow-hidden">
              <img
                :src="item.attributes?.posterImage?.large || item.attributes?.posterImage?.original"
                :alt="item.attributes?.canonicalTitle"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90 group-hover:opacity-100"
                loading="lazy"
              />
              <div class="absolute inset-0 bg-gradient-to-t from-[#1e1e1e] sm:bg-gradient-to-r via-transparent to-transparent"></div>
              
              <!-- Status Badge -->
              <div class="absolute top-3 left-3 z-10">
                <span class="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide backdrop-blur-sm shadow-sm uppercase" :class="getStatusBadge(item.attributes?.status)">
                  {{ item.attributes?.status || 'UNKNOWN' }}
                </span>
              </div>
              
              <!-- Score Badge -->
              <div class="absolute top-3 right-3 sm:left-3 sm:top-10 sm:right-auto z-10 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 border border-white/10 mt-1">
                <span class="material-symbols-outlined text-yellow-400 text-[14px]">star</span>
                <span class="text-white font-bold text-xs">{{ item.attributes?.averageRating ? item.attributes.averageRating + '%' : 'N/A' }}</span>
              </div>
            </div>

            <!-- Content -->
            <div class="p-5 flex-1 flex flex-col justify-between">
              <div>
                <h3 class="text-xl font-bold text-white mb-2 line-clamp-2 leading-tight group-hover:text-[#55d8e1] transition-colors">
                  {{ item.attributes?.canonicalTitle }}
                </h3>
                <p class="text-sm text-gray-400 line-clamp-4 leading-relaxed mt-3">
                  {{ item.attributes?.synopsis || 'Tidak ada sinopsis tersedia.' }}
                </p>
              </div>

              <!-- Action Buttons -->
              <div class="mt-6 flex flex-col gap-2">
                <button
                  @click="openWebtoon(item.attributes?.canonicalTitle)"
                  class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm shadow-lg transition-all"
                >
                  <span class="material-symbols-outlined text-[18px]">search</span>
                  Baca Resmi di Webtoon
                </button>
                <button
                  @click="openGoogle(item.attributes?.canonicalTitle)"
                  class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2a2a2a] hover:bg-[#353535] text-gray-300 rounded-xl font-semibold text-sm transition-all border border-white/5"
                >
                  <span class="material-symbols-outlined text-[18px]">travel_explore</span>
                  Cari Sumber Bacaan
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="!pending && !error && metaCount > 0" class="mt-12 flex items-center justify-center gap-4">
        <button
          @click="prevPage"
          :disabled="currentPage === 1"
          class="flex items-center gap-2 px-5 py-2.5 bg-[#1e1e1e] border border-white/10 rounded-xl font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2a2a2a] hover:text-[#55d8e1]"
        >
          <span class="material-symbols-outlined">chevron_left</span>
          Sebelumnya
        </button>

        <div class="px-6 py-2.5 bg-[#1a1a1a] rounded-xl font-bold text-[#55d8e1] border border-[#55d8e1]/30">
          Halaman {{ currentPage }}
        </div>

        <button
          @click="nextPage"
          :disabled="!hasNextPage"
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
.line-clamp-4 {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
