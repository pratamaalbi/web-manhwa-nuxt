<script setup>
import { ref, computed } from 'vue'
import { useBookmarks } from '~/composables/useBookmarks'

// ============================================
// 1. Composables
// ============================================
const { bookmarks } = useBookmarks()

// ============================================
// 2. State Management
// ============================================
const activeTab = ref('all')       // 'all' | 'manga' | 'manhwa'
const activeFilter = ref('all')    // 'all' | 'following'
const selectedGenreId = ref('')

// ============================================
// 3. Tab Configuration
// ============================================
const tabs = [
  { value: 'all', label: 'Semua', icon: 'apps' },
  { value: 'manga', label: 'Manga', icon: 'menu_book' },
  { value: 'manhwa', label: 'Manhwa', icon: 'auto_stories' }
]

const activeTabIndex = computed(() => tabs.findIndex(t => t.value === activeTab.value))

// ============================================
// 4. Genre Configuration
// ============================================
const genresList = [
  { name: 'Action', id: '391b0423-d847-456f-aff0-8b0cfc03066b', icon: 'local_fire_department' },
  { name: 'Romance', id: '423e2eae-977e-4144-98fd-9a35d20ea6a6', icon: 'favorite' },
  { name: 'Fantasy', id: 'cdc58593-abbf-46cc-a419-618aedebd81b', icon: 'auto_awesome' },
  { name: 'Slice of Life', id: 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9', icon: 'wb_sunny' }
]

// ============================================
// 5. Reactive API Query Parameters
// ============================================
const originalLanguageParam = computed(() => {
  if (activeTab.value === 'manga') return ['ja']
  if (activeTab.value === 'manhwa') return ['ko']
  return []
})

// Manhwa pada MangaDex kebanyakan belum ditranslasi ke ID,
// jadi filter bahasa hanya diterapkan untuk tab Semua & Manga.
const translatedLanguageParam = computed(() => {
  if (activeTab.value === 'manhwa') return []
  return ['id']
})

// Genre tag untuk filter sidebar; tidak ada Long Strip tag agar hasil tidak kosong
const latestTagsParam = computed(() => {
  if (selectedGenreId.value) return [selectedGenreId.value]
  return []
})

// ============================================
// 6. Data Fetching — Trending / Hot
// ============================================
const {
  data: popularData,
  pending: popularLoading,
  error: popularError
} = await useFetch('/api/mangadex/manga', {
  query: {
    limit: 10,
    'order[followedCount]': 'desc',
    'includes[]': ['cover_art'],
    'availableTranslatedLanguage[]': translatedLanguageParam,
    'originalLanguage[]': originalLanguageParam
  },
  watch: [activeTab]
})

// ============================================
// 7. Data Fetching — Latest Updates
// ============================================
const {
  data: latestData,
  pending: latestLoading,
  error: latestError
} = await useFetch('/api/mangadex/manga', {
  query: {
    limit: 18,
    'order[latestUploadedChapter]': 'desc',
    'includes[]': ['cover_art'],
    'availableTranslatedLanguage[]': translatedLanguageParam,
    'originalLanguage[]': originalLanguageParam,
    'includedTags[]': latestTagsParam
  },
  watch: [activeTab, selectedGenreId]
})

// ============================================
// 8. Search Logic
// ============================================
const searchQuery = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const searchError = ref(null)
const isSearchFocused = ref(false)

let debounceTimeout = null
const onSearchInput = () => {
  clearTimeout(debounceTimeout)
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    isSearching.value = false
    return
  }
  isSearching.value = true
  debounceTimeout = setTimeout(async () => {
    try {
      const res = await $fetch('/api/mangadex/manga', {
        query: {
          limit: 15,
          title: searchQuery.value,
          'includes[]': ['cover_art'],
          'availableTranslatedLanguage[]': ['id']
        }
      })
      searchResults.value = res.data || []
      searchError.value = null
    } catch (err) {
      searchError.value = err
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }, 500)
}

// ============================================
// 9. Helper Functions
// ============================================
const getMangaTitle = (manga) => {
  if (!manga?.attributes?.title) return 'Unknown Title'
  const title = manga.attributes.title
  return title.id || title.en || title.ja || Object.values(title)[0] || 'Unknown Title'
}

const getCoverUrl = (manga) => {
  if (!manga) return ''
  const coverArt = manga.relationships?.find(r => r.type === 'cover_art')
  const fileName = coverArt?.attributes?.fileName
  if (!fileName) return 'https://placehold.co/256x360/201f1f/55d8e1?text=No+Cover'
  // Route through server proxy to bypass ISP SSL/DNS issues for uploads.mangadex.org
  const originalUrl = `https://uploads.mangadex.org/covers/${manga.id}/${fileName}.256.jpg`
  return `/api/cover-proxy?url=${encodeURIComponent(originalUrl)}`
}

const getStatusInfo = (status) => {
  const map = {
    ongoing:   { label: 'Ongoing',    color: 'bg-[#00adb5]/90 text-white' },
    completed: { label: 'Tamat',      color: 'bg-emerald-500/90 text-white' },
    hiatus:    { label: 'Hiatus',     color: 'bg-amber-500/90 text-white' },
    cancelled: { label: 'Dibatalkan', color: 'bg-red-500/90 text-white' }
  }
  return map[status] || { label: status || 'N/A', color: 'bg-gray-500/90 text-white' }
}

const getContentRatingInfo = (rating) => {
  const map = {
    safe:          { label: 'Safe',       color: 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' },
    suggestive:    { label: 'Suggestive', color: 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30' },
    erotica:       { label: 'Erotica',    color: 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30' },
    pornographic:  { label: '18+',        color: 'bg-red-600/20 text-red-400 ring-1 ring-red-600/30' }
  }
  return map[rating] || { label: rating || 'N/A', color: 'bg-gray-500/20 text-gray-400 ring-1 ring-gray-500/30' }
}

const getMangaTags = (manga, max = 2) => {
  if (!manga?.attributes?.tags) return []
  return manga.attributes.tags
    .filter(t => t.attributes?.group === 'genre')
    .slice(0, max)
    .map(t => t.attributes?.name?.en || '')
    .filter(Boolean)
}

// ============================================
// 10. Computed Data
// ============================================
const trendingManga = computed(() => popularData.value?.data || [])

const latestUpdates = computed(() => {
  if (activeFilter.value === 'following') return bookmarks.value
  return latestData.value?.data || []
})

const trendingTitle = computed(() => {
  if (activeTab.value === 'manga') return '🔥 Manga Terpopuler'
  if (activeTab.value === 'manhwa') return '🔥 Manhwa Terpopuler'
  return '🔥 Trending Terpopuler'
})

const latestTitle = computed(() => {
  if (activeFilter.value === 'following') return 'Bookmarks Saya'
  if (activeTab.value === 'manga') return 'Update Manga Terbaru'
  if (activeTab.value === 'manhwa') return 'Update Manhwa Terbaru'
  return 'Update Chapter Terbaru'
})

// ============================================
// 11. Navigation & Actions
// ============================================
const navigateToDetail = (mangaId) => {
  navigateTo(`/manga/detail/${mangaId}`)
}

const selectGenre = (genreId) => {
  selectedGenreId.value = selectedGenreId.value === genreId ? '' : genreId
  activeFilter.value = 'all'
}

const switchTab = (tabValue) => {
  if (activeTab.value === tabValue) return
  activeTab.value = tabValue
  activeFilter.value = 'all'
}
</script>

<template>
  <div class="bg-[#121212] text-[#e5e2e1] min-h-screen font-sans overflow-x-hidden selection:bg-[#55d8e1]/30 selection:text-[#55d8e1]">

    <!-- =============================== -->
    <!-- LOADING BAR (top, fixed)        -->
    <!-- =============================== -->
    <Transition name="fade">
      <div v-if="popularLoading || latestLoading" class="fixed top-0 left-0 right-0 h-[3px] z-[60] overflow-hidden bg-[#00adb5]/20">
        <div class="h-full w-1/3 bg-gradient-to-r from-transparent via-[#55d8e1] to-transparent loading-bar" />
      </div>
    </Transition>

    <!-- =============================== -->
    <!-- NAVBAR                          -->
    <!-- =============================== -->
    <nav class="fixed top-0 w-full z-50 bg-[#131313]/90 backdrop-blur-md flex justify-between items-center px-6 py-3 max-w-full border-b border-white/5">
      <div class="flex items-center gap-4">
        <h1 class="text-2xl font-black text-[#55d8e1] tracking-wider cursor-pointer select-none" @click="navigateTo('/')">MangaStream</h1>
      </div>

      <!-- Desktop Search -->
      <div class="hidden md:flex flex-1 max-w-xl mx-auto relative items-center transition-all duration-300" :class="isSearchFocused ? 'max-w-2xl' : 'max-w-xl'">
        <span class="material-symbols-outlined absolute left-4 text-gray-400">search</span>
        <input
          v-model="searchQuery"
          @input="onSearchInput"
          @focus="isSearchFocused = true"
          @blur="isSearchFocused = false"
          class="w-full bg-[#1c1b1b] border-none rounded-lg py-2.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-[#55d8e1] focus:outline-none placeholder-gray-500 transition-all text-white"
          placeholder="Cari manga berdasarkan judul..."
          type="text"
        />
        <button v-if="searchQuery" @click="searchQuery = ''; searchResults = []" class="absolute right-4 text-gray-400 hover:text-white">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div class="flex items-center gap-4">
        <!-- AniList Manhwa Shortcut -->
        <NuxtLink
          to="/manhwa-anilist"
          class="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all text-xs font-bold ring-1 ring-violet-500/20 whitespace-nowrap"
        >
          <span class="material-symbols-outlined text-[16px]">auto_stories</span>
          AniList Manhwa
        </NuxtLink>
        <button class="material-symbols-outlined text-gray-400 hover:text-[#55d8e1] transition-colors" @click="activeFilter = 'following'">bookmarks</button>
        <div class="w-10 h-10 rounded-full overflow-hidden border-2 border-[#353534] cursor-pointer hover:border-[#55d8e1] transition-all">
          <img class="w-full h-full object-cover" src="https://api.dicebear.com/7.x/bottts/svg?seed=mangastream" alt="Profile" />
        </div>
      </div>
    </nav>

    <div class="flex pt-16">

      <!-- =============================== -->
      <!-- SIDEBAR (Desktop)               -->
      <!-- =============================== -->
      <aside class="fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-[#201f1f] hidden lg:flex flex-col p-4 z-40 border-r border-white/5">
        <!-- Current Tab Indicator -->
        <div class="px-4 py-3 mb-4 rounded-xl bg-gradient-to-r from-[#00adb5]/10 to-transparent border border-[#00adb5]/20">
          <p class="text-[11px] text-gray-500 uppercase tracking-widest font-medium">Sedang Dilihat</p>
          <p class="text-sm font-bold text-[#55d8e1] mt-0.5">
            {{ activeTab === 'manga' ? '🇯🇵 Manga Jepang' : activeTab === 'manhwa' ? '🇰🇷 Manhwa Korea' : '📚 Semua Komik' }}
          </p>
        </div>

        <div class="px-4 py-2">
          <h2 class="text-lg font-bold text-[#55d8e1]">Genres</h2>
          <p class="text-xs text-gray-400 mt-1">Jelajahi kategori</p>
        </div>
        <div class="flex-1 space-y-2 mt-4">
          <button
            v-for="genre in genresList"
            :key="genre.id"
            @click="selectGenre(genre.id)"
            :class="selectedGenreId === genre.id ? 'bg-[#00adb5] text-white' : 'text-gray-400 hover:bg-[#353534] hover:text-white'"
            class="w-full flex items-center gap-4 rounded-lg px-4 py-2.5 transition-all text-left"
          >
            <span class="material-symbols-outlined">{{ genre.icon }}</span>
            <span class="text-sm font-semibold">{{ genre.name }}</span>
          </button>
        </div>
        <div class="border-t border-white/5 pt-4 space-y-2">
          <button
            @click="activeFilter = activeFilter === 'following' ? 'all' : 'following'"
            :class="activeFilter === 'following' ? 'bg-[#55d8e1]/20 text-[#55d8e1]' : 'text-gray-400 hover:bg-[#353534] hover:text-white'"
            class="w-full flex items-center gap-4 rounded-lg px-4 py-2.5 transition-all text-left"
          >
            <span class="material-symbols-outlined">bookmarks</span>
            <span class="text-sm font-semibold">Bookmarks</span>
          </button>
        </div>
      </aside>

      <!-- =============================== -->
      <!-- MAIN CONTENT                    -->
      <!-- =============================== -->
      <main class="w-full lg:ml-64 px-4 md:px-8 py-8 pb-24 lg:pb-12 min-h-screen">

        <!-- Mobile Search -->
        <div class="block md:hidden mb-6 relative">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">search</span>
          <input
            v-model="searchQuery"
            @input="onSearchInput"
            class="w-full bg-[#1c1b1b] border-none rounded-lg py-2.5 pl-12 pr-4 text-sm focus:ring-2 focus:ring-[#55d8e1] focus:outline-none placeholder-gray-500 transition-all text-white"
            placeholder="Cari manga..."
            type="text"
          />
        </div>

        <!-- ========================== -->
        <!-- SEARCH RESULTS VIEW        -->
        <!-- ========================== -->
        <section v-if="searchQuery.trim() !== ''" class="mb-12">
          <div class="flex items-center gap-3 mb-6">
            <span class="w-1.5 h-8 bg-[#55d8e1] rounded-full"></span>
            <h2 class="text-2xl font-bold text-white">Hasil Pencarian: "{{ searchQuery }}"</h2>
          </div>

          <div v-if="isSearching" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            <div v-for="i in 5" :key="i" class="skeleton aspect-[3/4] rounded-xl"></div>
          </div>

          <div v-else-if="searchError" class="bg-red-950/20 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
            <span class="material-symbols-outlined text-3xl mb-2">error</span>
            <p class="text-sm">Terjadi kesalahan saat mencari manga. Silakan coba lagi.</p>
          </div>

          <div v-else-if="searchResults.length === 0" class="text-gray-400 py-16 text-center">
            <span class="material-symbols-outlined text-5xl text-gray-600 block mb-3">search_off</span>
            <p>Manga tidak ditemukan. Coba kata kunci lain.</p>
          </div>

          <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
            <div
              v-for="manga in searchResults"
              :key="manga.id"
              @click="navigateToDetail(manga.id)"
              class="group cursor-pointer"
            >
              <div class="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#1e1e1e] border border-white/5 mb-3 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(0,173,181,0.25)] group-hover:-translate-y-1">
                <img class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" :src="getCoverUrl(manga)" :alt="getMangaTitle(manga)" loading="lazy"/>
                <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
                <!-- Status Badge -->
                <div class="absolute top-2 left-2">
                  <span class="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide backdrop-blur-sm" :class="getStatusInfo(manga.attributes?.status).color">
                    {{ getStatusInfo(manga.attributes?.status).label }}
                  </span>
                </div>
                <!-- Content Rating Badge -->
                <div class="absolute top-2 right-2">
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-semibold backdrop-blur-sm" :class="getContentRatingInfo(manga.attributes?.contentRating).color">
                    {{ getContentRatingInfo(manga.attributes?.contentRating).label }}
                  </span>
                </div>
              </div>
              <h4 class="text-sm md:text-base font-semibold text-gray-200 line-clamp-2 group-hover:text-[#55d8e1] transition-colors leading-tight">{{ getMangaTitle(manga) }}</h4>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                <span v-for="tag in getMangaTags(manga)" :key="tag" class="text-[10px] text-gray-400 bg-[#2a2a2a] px-2 py-0.5 rounded-full">{{ tag }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- ========================== -->
        <!-- STANDARD LAYOUT            -->
        <!-- ========================== -->
        <template v-else>

          <!-- ======================== -->
          <!-- TAB NAVIGATION BAR       -->
          <!-- ======================== -->
          <div class="mb-8">
            <div class="relative flex bg-[#1a1a1a]/80 backdrop-blur-sm rounded-2xl p-1.5 border border-white/[0.06] shadow-lg max-w-lg">
              <!-- Animated Sliding Indicator -->
              <div
                class="absolute top-1.5 bottom-1.5 rounded-xl bg-gradient-to-r from-[#00adb5] to-[#0891b2] shadow-lg shadow-[#00adb5]/25 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                :style="{
                  width: `calc(${100 / tabs.length}% - 4px)`,
                  left: `calc(${activeTabIndex * (100 / tabs.length)}% + 2px)`
                }"
              />
              <!-- Tab Buttons -->
              <button
                v-for="tab in tabs"
                :key="tab.value"
                @click="switchTab(tab.value)"
                class="relative z-10 flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-colors duration-300 select-none"
                :class="activeTab === tab.value ? 'text-white' : 'text-gray-500 hover:text-gray-300'"
              >
                <span class="material-symbols-outlined text-[20px]">{{ tab.icon }}</span>
                <span>{{ tab.label }}</span>
              </button>
            </div>
          </div>

          <!-- ======================== -->
          <!-- TRENDING / HOT SECTION   -->
          <!-- ======================== -->
          <section class="mb-12">
            <div class="flex items-center justify-between mb-6">
              <div class="flex items-center gap-3">
                <span class="w-1.5 h-8 bg-gradient-to-b from-[#55d8e1] to-[#00adb5] rounded-full"></span>
                <h2 class="text-2xl font-bold text-white">{{ trendingTitle }}</h2>
              </div>
              <div v-if="popularLoading && trendingManga.length > 0" class="flex items-center gap-2 text-xs text-gray-500">
                <div class="w-3.5 h-3.5 border-2 border-[#55d8e1] border-t-transparent rounded-full animate-spin" />
                <span>Memuat...</span>
              </div>
            </div>

            <!-- Skeleton (first load) -->
            <div v-if="popularLoading && trendingManga.length === 0" class="flex gap-6 overflow-hidden">
              <div v-for="i in 4" :key="i" class="skeleton w-72 md:w-80 h-[420px] rounded-xl flex-none" />
            </div>

            <!-- Error -->
            <div v-else-if="popularError" class="bg-red-950/20 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
              <span class="material-symbols-outlined text-3xl mb-2">wifi_off</span>
              <p class="text-sm">Gagal memuat data trending. Silakan periksa koneksi internet Anda.</p>
            </div>

            <!-- Trending Cards -->
            <div v-else>
              <div
                :class="{ 'opacity-40': popularLoading }"
                class="flex overflow-x-auto gap-6 pb-4 hide-scrollbar snap-x snap-mandatory transition-opacity duration-300"
              >
                <div
                  v-for="(manga, index) in trendingManga"
                  :key="manga.id"
                  @click="navigateToDetail(manga.id)"
                  class="flex-none w-72 md:w-80 group snap-start cursor-pointer"
                >
                  <div class="relative h-[420px] w-full rounded-xl overflow-hidden bg-[#1e1e1e] border border-white/5 transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_8px_30px_rgba(0,173,181,0.25)]">
                    <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" :src="getCoverUrl(manga)" :alt="getMangaTitle(manga)" loading="lazy"/>
                    <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-black/30 to-transparent" />

                    <!-- Rank Number -->
                    <div class="absolute top-3 left-3 w-9 h-9 rounded-lg bg-[#00adb5]/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                      <span class="text-white font-black text-sm">#{{ index + 1 }}</span>
                    </div>

                    <!-- Status Badge -->
                    <div class="absolute top-3 right-3">
                      <span class="px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide backdrop-blur-sm shadow-sm" :class="getStatusInfo(manga.attributes?.status).color">
                        {{ getStatusInfo(manga.attributes?.status).label }}
                      </span>
                    </div>

                    <!-- Bottom Info -->
                    <div class="absolute bottom-0 left-0 right-0 p-5">
                      <!-- Content Rating -->
                      <span class="inline-block px-2 py-0.5 rounded text-[10px] font-semibold mb-2.5 backdrop-blur-sm" :class="getContentRatingInfo(manga.attributes?.contentRating).color">
                        {{ getContentRatingInfo(manga.attributes?.contentRating).label }}
                      </span>

                      <h3 class="text-lg font-bold text-white truncate mb-1.5 group-hover:text-[#55d8e1] transition-colors">
                        {{ getMangaTitle(manga) }}
                      </h3>

                      <!-- Tags -->
                      <div class="flex flex-wrap gap-1.5">
                        <span v-for="tag in getMangaTags(manga, 3)" :key="tag" class="text-[10px] text-gray-300 bg-white/10 px-2 py-0.5 rounded-full backdrop-blur-sm">
                          {{ tag }}
                        </span>
                        <span v-if="activeTab === 'manhwa'" class="text-[10px] text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full ring-1 ring-violet-500/30">
                          Webtoon
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ======================== -->
          <!-- LATEST UPDATES SECTION   -->
          <!-- ======================== -->
          <section>
            <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div class="flex items-center gap-3">
                <span class="w-1.5 h-8 bg-gradient-to-b from-[#55d8e1] to-[#00adb5] rounded-full"></span>
                <h2 class="text-2xl font-bold text-white">{{ latestTitle }}</h2>
                <div v-if="latestLoading && latestUpdates.length > 0" class="flex items-center gap-2 ml-2">
                  <div class="w-4 h-4 border-2 border-[#55d8e1] border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div class="flex gap-2 bg-[#1a1a1a] p-1 rounded-xl border border-white/5">
                <button
                  @click="activeFilter = 'all'"
                  :class="activeFilter === 'all' ? 'bg-[#353534] text-[#55d8e1] shadow-sm' : 'text-gray-500 hover:text-gray-300'"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                >Semua</button>
                <button
                  @click="activeFilter = 'following'"
                  :class="activeFilter === 'following' ? 'bg-[#353534] text-[#55d8e1] shadow-sm' : 'text-gray-500 hover:text-gray-300'"
                  class="px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5"
                >
                  <span class="material-symbols-outlined text-[16px]">bookmarks</span>
                  Diikuti
                </button>
              </div>
            </div>

            <!-- Loading Skeleton (first load) -->
            <div v-if="latestLoading && activeFilter !== 'following' && latestUpdates.length === 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6">
              <div v-for="i in 12" :key="i" class="space-y-3">
                <div class="skeleton aspect-[3/4] rounded-xl" />
                <div class="skeleton h-4 rounded-full w-3/4" />
                <div class="skeleton h-3 rounded-full w-1/2" />
              </div>
            </div>

            <!-- Error State -->
            <div v-else-if="latestError && activeFilter !== 'following'" class="bg-red-950/20 border border-red-500/20 text-red-400 p-6 rounded-xl text-center">
              <span class="material-symbols-outlined text-3xl mb-2">error</span>
              <p class="text-sm">Gagal memuat update terbaru. Silakan coba lagi.</p>
            </div>

            <!-- Empty Bookmarks State -->
            <div v-else-if="activeFilter === 'following' && latestUpdates.length === 0" class="text-gray-400 py-16 text-center bg-[#1a1a1a]/50 rounded-2xl border border-white/5">
              <span class="material-symbols-outlined text-5xl text-gray-600 block mb-3">bookmark_border</span>
              <p class="text-sm">Belum ada manga yang diikuti.</p>
              <p class="text-xs text-gray-500 mt-1">Klik bookmark pada halaman detail manga untuk mengikutinya!</p>
            </div>

            <!-- Empty API Results -->
            <div v-else-if="activeFilter !== 'following' && latestUpdates.length === 0 && !latestLoading" class="text-gray-400 py-16 text-center bg-[#1a1a1a]/50 rounded-2xl border border-white/5">
              <span class="material-symbols-outlined text-5xl text-gray-600 block mb-3">search_off</span>
              <p class="text-sm">Tidak ada komik ditemukan untuk kategori ini.</p>
            </div>

            <!-- Grid Content -->
            <div
              v-else
              :class="{ 'opacity-40': latestLoading && activeFilter !== 'following' }"
              class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6 transition-opacity duration-300"
            >
              <div
                v-for="manga in latestUpdates"
                :key="manga.id"
                @click="navigateToDetail(manga.id)"
                class="group cursor-pointer"
              >
                <!-- Cover Image -->
                <div class="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#1e1e1e] border border-white/5 mb-3 transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(0,173,181,0.25)] group-hover:-translate-y-1">
                  <img
                    class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    :src="activeFilter === 'following' ? manga.coverUrl : getCoverUrl(manga)"
                    :alt="activeFilter === 'following' ? manga.title : getMangaTitle(manga)"
                    loading="lazy"
                  />
                  <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />

                  <!-- Status Badge (top-left) -->
                  <div v-if="activeFilter !== 'following'" class="absolute top-2 left-2">
                    <span
                      class="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide backdrop-blur-sm shadow-sm"
                      :class="getStatusInfo(manga.attributes?.status).color"
                    >
                      {{ getStatusInfo(manga.attributes?.status).label }}
                    </span>
                  </div>

                  <!-- Content Rating Badge (top-right) -->
                  <div v-if="activeFilter !== 'following'" class="absolute top-2 right-2">
                    <span
                      class="px-1.5 py-0.5 rounded text-[9px] font-semibold backdrop-blur-sm"
                      :class="getContentRatingInfo(manga.attributes?.contentRating).color"
                    >
                      {{ getContentRatingInfo(manga.attributes?.contentRating).label }}
                    </span>
                  </div>

                  <!-- Webtoon Badge (manhwa tab only) -->
                  <div v-if="activeTab === 'manhwa' && activeFilter !== 'following'" class="absolute bottom-2 left-2">
                    <span class="px-2 py-0.5 rounded-md bg-violet-500/80 text-white text-[10px] font-bold backdrop-blur-sm shadow-sm ring-1 ring-violet-400/30">
                      WEBTOON
                    </span>
                  </div>

                  <!-- Following Badge (bookmarks only) -->
                  <div v-if="activeFilter === 'following'" class="absolute top-2 left-2">
                    <span class="px-2 py-0.5 rounded-md bg-[#55d8e1]/90 text-white text-[10px] font-bold backdrop-blur-sm capitalize">
                      {{ manga.type || 'Manga' }}
                    </span>
                  </div>
                </div>

                <!-- Title -->
                <h4 class="text-sm md:text-base font-semibold text-gray-200 line-clamp-2 group-hover:text-[#55d8e1] transition-colors leading-tight">
                  {{ activeFilter === 'following' ? manga.title : getMangaTitle(manga) }}
                </h4>

                <!-- Tags / Bottom Info -->
                <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <template v-if="activeFilter !== 'following'">
                    <span
                      v-for="tag in getMangaTags(manga)"
                      :key="tag"
                      class="text-[10px] text-gray-400 bg-[#2a2a2a] px-2 py-0.5 rounded-full"
                    >{{ tag }}</span>
                  </template>
                  <template v-else>
                    <span class="text-[#55d8e1] text-xs font-bold hover:underline">Lihat Detail</span>
                  </template>
                </div>
              </div>
            </div>
          </section>
        </template>

      </main>
    </div>

    <!-- =============================== -->
    <!-- MOBILE BOTTOM NAVIGATION        -->
    <!-- =============================== -->
    <nav class="fixed bottom-0 w-full bg-[#131313]/95 backdrop-blur-md flex md:hidden justify-around items-center py-3 z-50 border-t border-white/10 pb-safe">
      <button
        @click="switchTab('all'); searchQuery = ''"
        :class="activeTab === 'all' && !searchQuery ? 'text-[#55d8e1]' : 'text-gray-500'"
        class="flex flex-col items-center gap-1 transition-colors"
      >
        <span class="material-symbols-outlined">apps</span>
        <span class="text-[10px] font-medium">Semua</span>
      </button>
      <button
        @click="switchTab('manga'); searchQuery = ''"
        :class="activeTab === 'manga' ? 'text-[#55d8e1]' : 'text-gray-500'"
        class="flex flex-col items-center gap-1 transition-colors"
      >
        <span class="material-symbols-outlined">menu_book</span>
        <span class="text-[10px] font-medium">Manga</span>
      </button>
      <button
        @click="switchTab('manhwa'); searchQuery = ''"
        :class="activeTab === 'manhwa' ? 'text-[#55d8e1]' : 'text-gray-500'"
        class="flex flex-col items-center gap-1 transition-colors"
      >
        <span class="material-symbols-outlined">auto_stories</span>
        <span class="text-[10px] font-medium">Manhwa</span>
      </button>
      <button
        @click="activeFilter = 'following'; searchQuery = ''"
        :class="activeFilter === 'following' ? 'text-[#55d8e1]' : 'text-gray-500'"
        class="flex flex-col items-center gap-1 transition-colors"
      >
        <span class="material-symbols-outlined">bookmarks</span>
        <span class="text-[10px] font-medium">Bookmarks</span>
      </button>
    </nav>

  </div>
</template>

<style scoped>
/* Hide scrollbar for horizontal scroll */
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Safe area padding for mobile */
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 12px); }

/* Shimmer skeleton animation */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, #1e1e1e 25%, #2a2a2a 37%, #1e1e1e 63%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 12px;
}

/* Top loading bar animation */
@keyframes loadingSlide {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(100%); }
  100% { transform: translateX(300%); }
}
.loading-bar {
  animation: loadingSlide 1.5s ease-in-out infinite;
}

/* Fade transition for loading bar */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* Line clamp fallback */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>