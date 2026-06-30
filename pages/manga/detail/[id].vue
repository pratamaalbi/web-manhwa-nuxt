<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBookmarks } from '~/composables/useBookmarks'

const route = useRoute()
const router = useRouter()
const mangaId = route.params.id

const { addBookmark, removeBookmark, isBookmarked } = useBookmarks()

// ─── Manga Detail ────────────────────────────────────────────────────
const {
  data: mangaData,
  pending: mangaLoading,
  error: mangaError
} = await useFetch(`/api/mangadex/manga/${mangaId}`, {
  query: { 'includes[]': ['cover_art', 'author', 'artist'] }
})

// ─── Chapter Feed — Smart Language Fallback ──────────────────────────
// Detect if this is a manhwa (Korean origin)
const mangaOriginalLang = computed(() =>
  mangaData.value?.data?.attributes?.originalLanguage || 'ja'
)
const isManhwa = computed(() => mangaOriginalLang.value === 'ko')

// Priority order: Indonesian → English → any language
const LANG_PRIORITY = ['id', 'en']
const activeLangLabel = ref('')
const feedLang = ref(['id'])
const userInteracted = ref(false)

const selectedLang = computed({
  get() {
    if (feedLang.value.length === 0) return 'all'
    return feedLang.value[0]
  },
  set(val) {
    userInteracted.value = true
    if (val === 'all') {
      feedLang.value = []
      activeLangLabel.value = 'Semua Bahasa'
    } else {
      feedLang.value = [val]
      activeLangLabel.value = val === 'id' ? 'Bahasa Indonesia' : 'Bahasa Inggris'
    }
  }
})

const {
  data: feedData,
  pending: feedLoading,
  error: feedError
} = await useFetch(() => `/api/mangadex/manga/${mangaId}/feed`, {
  query: {
    limit: 200,
    'translatedLanguage[]': feedLang,
    'order[chapter]': 'desc',
    'includes[]': ['scanlation_group']
  },
  watch: [feedLang]
})

const chapterList = computed(() => feedData.value?.data || [])

// Fallback logic: try next language if current returns nothing
const tryFallback = () => {
  if (feedLoading.value || userInteracted.value) return

  if (chapterList.value.length > 0) {
    // We have results — set label
    const labelMap = { id: 'Bahasa Indonesia', en: 'Bahasa Inggris' }
    const lang = feedLang.value[0]
    activeLangLabel.value = labelMap[lang] || lang?.toUpperCase() || 'Semua Bahasa'
    return
  }

  // No results with current lang — try next
  const currentIdx = feedLang.value.length ? LANG_PRIORITY.indexOf(feedLang.value[0]) : -1

  if (currentIdx === -1) {
    // Already on "all languages" — nothing more to try
    activeLangLabel.value = 'Semua Bahasa'
    return
  }

  if (currentIdx < LANG_PRIORITY.length - 1) {
    // Try next language in priority list
    feedLang.value = [LANG_PRIORITY[currentIdx + 1]]
  } else {
    // Last resort: no language filter (any language)
    feedLang.value = []
    activeLangLabel.value = 'Semua Bahasa'
  }
}

// Watch for changes after re-fetch completes
watch([chapterList, feedLoading], ([_list, loading]) => {
  if (!loading) tryFallback()
})

// Also run after initial load
onMounted(async () => {
  await nextTick()
  tryFallback()
})

// ─── Helpers ─────────────────────────────────────────────────────────
const getMangaTitle = (manga) => {
  if (!manga?.attributes?.title) return 'Unknown Title'
  const t = manga.attributes.title
  return t.id || t.en || t.ja || Object.values(t)[0] || 'Unknown Title'
}

const getMangaDescription = (manga) => {
  if (!manga?.attributes?.description) return 'Tidak ada deskripsi.'
  const d = manga.attributes.description
  return d.id || d.en || d.ja || Object.values(d)[0] || 'Tidak ada deskripsi.'
}

const getCoverUrl = (manga) => {
  if (!manga) return ''
  const coverArt = manga.relationships?.find(r => r.type === 'cover_art')
  const fileName = coverArt?.attributes?.fileName
  if (!fileName) return 'https://placehold.co/256x360/201f1f/55d8e1?text=No+Cover'
  const originalUrl = `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`
  return `/api/cover-proxy?url=${encodeURIComponent(originalUrl)}`
}

const getAuthor = (manga) => manga.relationships?.find(r => r.type === 'author')?.attributes?.name || 'Unknown'
const getArtist = (manga) => manga.relationships?.find(r => r.type === 'artist')?.attributes?.name || 'Unknown'
const getScanlationGroup = (chapter) =>
  chapter.relationships?.find(r => r.type === 'scanlation_group')?.attributes?.name || 'Unknown Group'

const getLangBadge = (lang) => {
  const map = { id: '🇮🇩', en: '🇺🇸', ko: '🇰🇷', ja: '🇯🇵', zh: '🇨🇳', 'zh-hk': '🇭🇰' }
  return map[lang] || '🌐'
}

const getFormattedDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

// ─── Bookmark ─────────────────────────────────────────────────────────
const isFav = computed(() => isBookmarked(mangaId))

const toggleBookmark = () => {
  if (isFav.value) {
    removeBookmark(mangaId)
  } else {
    const manga = mangaData.value?.data
    if (manga) {
      addBookmark({
        id: manga.id,
        title: getMangaTitle(manga),
        coverUrl: getCoverUrl(manga),
        type: manga.attributes?.status || 'Ongoing'
      })
    }
  }
}

const navigateToChapter = (chapterId) => navigateTo(`/chapter/${chapterId}`)

const goBack = () => {
  if (window.history.state && window.history.state.back) {
    router.back()
  } else {
    navigateTo('/')
  }
}
</script>

<template>
  <div class="bg-[#121212] text-[#e5e2e1] min-h-screen font-sans overflow-x-hidden selection:bg-[#55d8e1]/30 selection:text-[#55d8e1]">

    <!-- Loading State -->
    <div v-if="mangaLoading" class="min-h-screen flex flex-col justify-center items-center gap-4">
      <div class="w-12 h-12 border-4 border-[#55d8e1] border-t-transparent rounded-full animate-spin"></div>
      <p class="text-gray-400 text-sm font-medium">Memuat data manga...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="mangaError" class="min-h-screen flex flex-col justify-center items-center gap-4 px-6 text-center">
      <span class="material-symbols-outlined text-red-400 text-6xl">error</span>
      <h2 class="text-2xl font-bold text-white">Gagal Memuat Manga</h2>
      <p class="text-gray-400 max-w-md">Manga tidak ditemukan atau terjadi masalah pada API MangaDex.</p>
      <button @click="goBack" class="bg-[#00adb5] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-[#55d8e1] transition-all">Kembali</button>
    </div>

    <!-- Content -->
    <div v-else-if="mangaData?.data">
      <!-- Back Header -->
      <header class="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-md px-6 py-4 flex items-center gap-4 border-b border-white/5">
        <button @click="goBack" class="w-10 h-10 rounded-full bg-[#1c1b1b] hover:bg-[#353534] flex items-center justify-center text-white transition-all">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 class="text-lg font-bold truncate flex-1">{{ getMangaTitle(mangaData.data) }}</h2>
        <span v-if="isManhwa" class="px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold ring-1 ring-violet-500/30 whitespace-nowrap flex-none">
          🇰🇷 Manhwa
        </span>
      </header>

      <!-- Banner Hero -->
      <div class="relative h-[250px] md:h-[350px] w-full overflow-hidden mt-16">
        <img class="w-full h-full object-cover blur-2xl opacity-30 scale-110" :src="getCoverUrl(mangaData.data)" alt="Banner" />
        <div class="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent"></div>
      </div>

      <!-- Main Info Container -->
      <div class="max-w-6xl mx-auto px-4 md:px-8 -mt-36 md:-mt-48 relative z-10 pb-20">
        <div class="flex flex-col md:flex-row gap-8 items-start">

          <!-- Cover Art -->
          <div class="w-48 md:w-64 flex-none mx-auto md:mx-0 bg-[#201f1f] rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] border border-white/5">
            <img class="w-full h-auto" :src="getCoverUrl(mangaData.data)" :alt="getMangaTitle(mangaData.data)" />
          </div>

          <!-- Info -->
          <div class="flex-1 text-center md:text-left">
            <h1 class="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight mb-2">
              {{ getMangaTitle(mangaData.data) }}
            </h1>
            <p class="text-[#55d8e1] font-semibold text-sm mb-4">
              {{ getAuthor(mangaData.data) }} (Author) &bull; {{ getArtist(mangaData.data) }} (Artist)
            </p>

            <div class="flex flex-wrap gap-2 justify-center md:justify-start mb-6">
              <span class="bg-[#1c1b1b] border border-[#353534] text-xs font-bold px-3 py-1 rounded-md text-gray-300 uppercase tracking-wider">
                {{ mangaData.data.attributes?.status || 'Ongoing' }}
              </span>
              <span class="bg-[#1c1b1b] border border-[#353534] text-xs font-bold px-3 py-1 rounded-md text-gray-400">
                {{ isManhwa ? '🇰🇷 Manhwa' : '🇯🇵 Manga' }}
              </span>
              <span
                v-for="tag in mangaData.data.attributes?.tags?.slice(0, 5)"
                :key="tag.id"
                class="bg-[#00adb5]/10 border border-[#00adb5]/20 text-[#55d8e1] text-xs font-semibold px-3 py-1 rounded-md"
              >
                {{ tag.attributes?.name?.en || 'Genre' }}
              </span>
            </div>

            <!-- Bookmark Button -->
            <div class="flex gap-4 justify-center md:justify-start mb-8">
              <button
                @click="toggleBookmark"
                :class="isFav ? 'bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30' : 'bg-[#00adb5] text-white hover:bg-[#55d8e1]'"
                class="flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95"
              >
                <span class="material-symbols-outlined">{{ isFav ? 'bookmark_added' : 'bookmark' }}</span>
                {{ isFav ? 'Diikuti' : 'Ikuti Manga' }}
              </button>
            </div>

            <!-- Synopsis -->
            <div class="bg-[#1c1b1b] rounded-2xl p-6 border border-white/5 text-left shadow-md">
              <h3 class="text-lg font-bold text-white mb-3">Sinopsis</h3>
              <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{{ getMangaDescription(mangaData.data) }}</p>
            </div>
          </div>
        </div>

        <!-- ─── Chapters Section ─────────────────────────────── -->
        <section class="mt-12">
          <div class="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <div class="flex items-center gap-3">
              <span class="w-1.5 h-8 bg-gradient-to-b from-[#55d8e1] to-[#00adb5] rounded-full"></span>
              <div>
                <h2 class="text-2xl font-bold text-white">Daftar Chapter</h2>
                <p v-if="!userInteracted && activeLangLabel" class="text-xs mt-0.5 text-gray-400">
                  <span class="text-[#00adb5]">Otomatis mendeteksi:</span> {{ activeLangLabel }}
                </p>
              </div>
            </div>
            
            <div class="flex items-center gap-3">
              <!-- Language Selector -->
              <div class="relative bg-[#1c1b1b] border border-white/5 rounded-lg flex items-center gap-2 px-3 py-2 hover:border-[#55d8e1]/50 transition-colors">
                <span class="material-symbols-outlined text-gray-400 text-[18px]">translate</span>
                <select v-model="selectedLang" class="bg-transparent text-xs font-bold text-gray-300 uppercase tracking-wider outline-none cursor-pointer appearance-none pr-6 w-full">
                  <option value="id" class="bg-[#1c1b1b] text-white">Bahasa Indonesia</option>
                  <option value="en" class="bg-[#1c1b1b] text-white">Bahasa Inggris</option>
                  <option value="all" class="bg-[#1c1b1b] text-white">Semua Bahasa</option>
                </select>
                <span class="material-symbols-outlined text-[16px] absolute right-2 text-gray-500 pointer-events-none">expand_more</span>
              </div>
            
              <span v-if="chapterList.length > 0" class="text-sm text-gray-400 bg-[#1c1b1b] px-3 py-2 rounded-lg border border-white/5 whitespace-nowrap">
                {{ chapterList.length }} chapter
              </span>
            </div>
          </div>

          <!-- Loading skeleton -->
          <div v-if="feedLoading" class="space-y-3">
            <div v-for="i in 6" :key="i" class="w-full h-16 bg-[#1c1b1b] rounded-xl animate-pulse"></div>
          </div>

          <!-- Error -->
          <div v-else-if="feedError" class="text-red-400 py-4 text-center bg-red-950/10 rounded-xl border border-red-500/20">
            Gagal memuat daftar chapter.
          </div>

          <!-- Truly empty -->
          <div v-else-if="chapterList.length === 0" class="text-center py-16 bg-[#1c1b1b]/50 rounded-2xl border border-white/5">
            <span class="material-symbols-outlined text-5xl text-gray-600 block mb-3">find_in_page</span>
            <p class="text-gray-400 text-sm font-medium">Belum ada chapter yang tersedia di MangaDex.</p>
            <p class="text-gray-600 text-xs mt-1">Coba kembali nanti atau cari di platform lain.</p>
          </div>

          <!-- Chapter list -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="chapter in chapterList"
              :key="chapter.id"
              @click="navigateToChapter(chapter.id)"
              class="bg-[#1c1b1b] border border-white/5 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:border-[#55d8e1]/40 hover:bg-[#212121] transition-all group"
            >
              <div class="flex flex-col min-w-0 pr-4">
                <span class="text-white font-bold group-hover:text-[#55d8e1] transition-colors truncate">
                  Chapter {{ chapter.attributes?.chapter || '?' }}
                  <span v-if="chapter.attributes?.title" class="font-normal text-xs text-gray-400 ml-1">
                    - {{ chapter.attributes.title }}
                  </span>
                </span>
                <span class="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
                  <span>{{ getLangBadge(chapter.attributes?.translatedLanguage) }}</span>
                  <span class="material-symbols-outlined text-[12px]">group</span>
                  {{ getScanlationGroup(chapter) }}
                </span>
              </div>
              <div class="flex flex-col items-end flex-none gap-1">
                <span class="text-xs text-gray-500">{{ getFormattedDate(chapter.attributes?.publishAt) }}</span>
                <span class="material-symbols-outlined text-gray-500 group-hover:text-[#55d8e1] transition-colors text-[18px]">arrow_forward_ios</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
