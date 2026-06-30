<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()
const id     = parseInt(route.params.id)

// ─── Fetch Detail from AniList ────────────────────────────────────────
const { data, pending, error } = await useFetch(`/api/anilist/${id}`)
const media = computed(() => data.value?.Media || null)

// ─── Match with MangaDex ─────────────────────────────────────────────
const mdMatchPending = ref(true)
const mangadexId = ref(null)

watch(media, async (newVal) => {
  if (newVal && newVal.title) {
    const title = newVal.title.english || newVal.title.userPreferred
    if (title) {
      try {
        const res = await $fetch('/api/anilist/match-mangadex', {
          query: { title, anilistId: newVal.id }
        })
        mangadexId.value = res.mangadexId
      } catch (err) {
        console.error('Failed to match MangaDex:', err)
      } finally {
        mdMatchPending.value = false
      }
    } else {
      mdMatchPending.value = false
    }
  }
}, { immediate: true })

// ─── Chapter Feed — Smart Language Fallback ──────────────────────────
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
} = await useFetch(() => mangadexId.value ? `/api/mangadex/manga/${mangadexId.value}/feed` : null, {
  query: {
    limit: 200,
    'translatedLanguage[]': feedLang,
    'order[chapter]': 'desc',
    'includes[]': ['scanlation_group']
  },
  watch: [feedLang, mangadexId]
})

const chapterList = computed(() => feedData.value?.data || [])

const tryFallback = () => {
  if (feedLoading.value || !mangadexId.value || userInteracted.value) return

  if (chapterList.value.length > 0) {
    const labelMap = { id: 'Bahasa Indonesia', en: 'Bahasa Inggris' }
    const lang = feedLang.value[0]
    activeLangLabel.value = labelMap[lang] || lang?.toUpperCase() || 'Semua Bahasa'
    return
  }

  const currentIdx = feedLang.value.length ? LANG_PRIORITY.indexOf(feedLang.value[0]) : -1
  if (currentIdx === -1) {
    activeLangLabel.value = 'Semua Bahasa'
    return
  }

  if (currentIdx < LANG_PRIORITY.length - 1) {
    feedLang.value = [LANG_PRIORITY[currentIdx + 1]]
  } else {
    feedLang.value = []
    activeLangLabel.value = 'Semua Bahasa'
  }
}

watch([chapterList, feedLoading], ([_list, loading]) => {
  if (!loading) tryFallback()
})

onMounted(async () => {
  await nextTick()
  tryFallback()
})

// ─── Translation ──────────────────────────────────────────────────────
const isTranslating    = ref(false)
const translatedDesc   = ref('')

const translateDesc = async () => {
  const raw = cleanHtml(media.value?.description)
  if (!raw || isTranslating.value) return
  isTranslating.value = true
  try {
    const res = await $fetch('/api/translate', { method: 'POST', body: { text: raw } })
    translatedDesc.value = res.translatedText
  } catch (e) {
    console.error('Translate error:', e)
  } finally {
    isTranslating.value = false
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────
const cleanHtml = (html) => {
  if (!html) return 'Tidak ada deskripsi.'
  return html.replace(/<[^>]*>?/gm, '').replace(/\n\n+/g, '\n\n').trim()
}

const getStatusInfo = (status) => {
  const map = {
    RELEASING: { label: 'Ongoing',    color: 'bg-[#00adb5]/90 text-white' },
    FINISHED:  { label: 'Selesai',    color: 'bg-emerald-500/90 text-white' },
    HIATUS:    { label: 'Hiatus',     color: 'bg-amber-500/90 text-white' },
    CANCELLED: { label: 'Dibatalkan', color: 'bg-red-500/90 text-white' }
  }
  return map[status] || { label: status || 'Unknown', color: 'bg-gray-500/90 text-white' }
}

const formatDate = (d) => {
  if (!d?.year) return 'N/A'
  return `${d.year}${d.month ? '/' + String(d.month).padStart(2,'0') : ''}${d.day ? '/' + String(d.day).padStart(2,'0') : ''}`
}

// Filter & group external links for reading
const readingLinks = computed(() => {
  if (!media.value?.externalLinks) return []
  // Prioritize known reading platforms
  const readingPlatforms = ['webtoon', 'tapas', 'tapastic', 'lezhin', 'tappytoon', 'manta', 'inkr', 'viz', 'manga plus', 'shonen jump', 'comixology', 'crunchyroll', 'pocket comics', 'lehzin', 'bomtoon', 'ridibooks', 'kakao']
  return media.value.externalLinks.filter(link => {
    const site = link.site?.toLowerCase() || ''
    return readingPlatforms.some(p => site.includes(p)) || link.type === 'STREAMING'
  })
})

const otherLinks = computed(() => {
  if (!media.value?.externalLinks) return []
  const readingIds = new Set(readingLinks.value.map(l => l.url))
  return media.value.externalLinks.filter(l => !readingIds.has(l.url))
})

// Chapters helpers
const getScanlationGroup = (chapter) =>
  chapter.relationships?.find(r => r.type === 'scanlation_group')?.attributes?.name || 'Unknown Group'

const getFormattedDate = (dateString) => {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

const navigateToChapter = (chapterId) => navigateTo(`/chapter/${chapterId}`)

// Recommendations
const recommendations = computed(() =>
  media.value?.recommendations?.nodes
    ?.map(n => n.mediaRecommendation)
    ?.filter(Boolean) || []
)
</script>

<template>
  <div class="bg-[#121212] text-[#e5e2e1] min-h-screen font-sans overflow-x-hidden selection:bg-[#55d8e1]/30 selection:text-[#55d8e1]">

    <!-- Navbar -->
    <nav class="fixed top-0 w-full z-50 bg-[#131313]/80 backdrop-blur-md px-6 py-4 flex items-center gap-4 border-b border-white/5">
      <button @click="router.back()" class="w-10 h-10 rounded-full bg-[#1c1b1b] hover:bg-[#353534] flex items-center justify-center text-white transition-all flex-none">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <span class="text-[#55d8e1] font-black text-xl tracking-wider cursor-pointer" @click="navigateTo('/')">MangaStream</span>
      <span class="text-gray-500 text-sm ml-2">/ <NuxtLink to="/manhwa-anilist" class="hover:text-[#55d8e1] transition-colors">AniList Manhwa</NuxtLink> / Detail</span>
    </nav>

    <!-- Loading -->
    <div v-if="pending" class="min-h-screen flex items-center justify-center pt-16">
      <div class="flex flex-col items-center gap-4">
        <div class="w-12 h-12 border-4 border-[#55d8e1] border-t-transparent rounded-full animate-spin"></div>
        <p class="text-gray-400 text-sm">Memuat data dari AniList...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error || !media" class="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center pt-16">
      <span class="material-symbols-outlined text-red-400 text-5xl">error</span>
      <h2 class="text-2xl font-bold text-white">Gagal Memuat Data</h2>
      <p class="text-gray-400 text-sm max-w-sm">Terjadi kesalahan saat mengambil data dari AniList.</p>
      <button @click="router.back()" class="mt-2 px-6 py-2.5 bg-[#00adb5] text-white rounded-xl font-bold hover:bg-[#55d8e1] transition-all">Kembali</button>
    </div>

    <!-- Content -->
    <div v-else class="pt-16">

      <!-- ── Banner ── -->
      <div class="relative h-[280px] md:h-[380px] w-full overflow-hidden">
        <img
          v-if="media.bannerImage"
          :src="media.bannerImage"
          alt="Banner"
          class="w-full h-full object-cover opacity-40"
        />
        <div v-else class="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]"></div>
        <div class="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/50 to-transparent"></div>

        <!-- AniList badge -->
        <div class="absolute top-4 right-4 flex items-center gap-1.5 bg-[#02a9ff]/20 border border-[#02a9ff]/30 text-[#02a9ff] px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm">
          <span class="material-symbols-outlined text-[14px]">database</span>
          Powered by AniList
        </div>
      </div>

      <!-- ── Main Container ── -->
      <div class="max-w-6xl mx-auto px-4 md:px-8 -mt-40 md:-mt-52 relative z-10 pb-20">
        <div class="flex flex-col md:flex-row gap-8">

          <!-- Cover -->
          <div class="w-48 md:w-64 flex-none mx-auto md:mx-0">
            <img
              :src="media.coverImage?.extraLarge || media.coverImage?.large"
              :alt="media.title?.userPreferred"
              class="w-full rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] border border-white/10"
            />
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <!-- Title -->
            <h1 class="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-1">
              {{ media.title?.english || media.title?.userPreferred }}
            </h1>
            <p v-if="media.title?.native" class="text-gray-500 text-sm mb-4">{{ media.title.native }}</p>

            <!-- Stats Row -->
            <div class="flex flex-wrap gap-3 mb-6">
              <!-- Status -->
              <span class="px-3 py-1 rounded-lg text-xs font-bold tracking-wide" :class="getStatusInfo(media.status).color">
                {{ getStatusInfo(media.status).label }}
              </span>
              <!-- Score -->
              <div class="flex items-center gap-1.5 bg-[#1e1e1e] border border-white/5 px-3 py-1 rounded-lg">
                <span class="material-symbols-outlined text-yellow-400 text-[16px]">star</span>
                <span class="text-white font-bold text-sm">{{ media.averageScore ? media.averageScore + '%' : 'N/A' }}</span>
              </div>
              <!-- Popularity -->
              <div class="flex items-center gap-1.5 bg-[#1e1e1e] border border-white/5 px-3 py-1 rounded-lg">
                <span class="material-symbols-outlined text-rose-400 text-[16px]">favorite</span>
                <span class="text-white font-bold text-sm">{{ media.favourites?.toLocaleString() || 'N/A' }}</span>
              </div>
              <!-- Chapters -->
              <div v-if="media.chapters" class="flex items-center gap-1.5 bg-[#1e1e1e] border border-white/5 px-3 py-1 rounded-lg">
                <span class="material-symbols-outlined text-[#55d8e1] text-[16px]">menu_book</span>
                <span class="text-white font-bold text-sm">{{ media.chapters }} ch</span>
              </div>
              <!-- Country -->
              <div class="flex items-center gap-1 bg-[#1e1e1e] border border-white/5 px-3 py-1 rounded-lg">
                <span class="text-sm">🇰🇷</span>
                <span class="text-gray-400 text-xs font-semibold">Manhwa</span>
              </div>
            </div>

            <!-- Genres -->
            <div class="flex flex-wrap gap-2 mb-6">
              <span
                v-for="genre in media.genres"
                :key="genre"
                class="px-3 py-1 rounded-full bg-[#00adb5]/10 border border-[#00adb5]/20 text-[#55d8e1] text-xs font-semibold"
              >{{ genre }}</span>
            </div>

            <!-- ── READING LINKS ── -->
            <div class="mb-6">
              <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span class="material-symbols-outlined text-[16px] text-[#55d8e1]">open_in_new</span>
                Baca di Platform Resmi
              </h3>

              <div v-if="readingLinks.length > 0" class="flex flex-wrap gap-3">
                <a
                  v-for="link in readingLinks"
                  :key="link.url"
                  :href="link.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 px-4 py-2.5 rounded-xl border font-semibold text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  :style="link.color ? `border-color: ${link.color}40; color: ${link.color}; background: ${link.color}15` : ''"
                  :class="!link.color ? 'border-[#55d8e1]/30 text-[#55d8e1] bg-[#55d8e1]/10 hover:bg-[#55d8e1]/20' : ''"
                >
                  <img v-if="link.icon" :src="link.icon" :alt="link.site" class="w-4 h-4 rounded object-contain" />
                  <span v-else class="material-symbols-outlined text-[16px]">auto_stories</span>
                  {{ link.site }}
                </a>
              </div>

              <!-- No reading links available -->
              <div v-else class="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <span class="material-symbols-outlined text-amber-400 text-[20px] flex-none mt-0.5">info</span>
                <div>
                  <p class="text-amber-300 text-sm font-semibold">Link baca resmi tidak tersedia di AniList</p>
                  <p class="text-gray-500 text-xs mt-1">
                    AniList tidak memiliki link platform untuk manhwa ini. Coba cari di
                    <a href="https://www.webtoons.com" target="_blank" class="text-[#55d8e1] underline">Webtoon</a> atau
                    <a href="https://tapas.io" target="_blank" class="text-[#55d8e1] underline">Tapas</a>.
                  </p>
                </div>
              </div>
            </div>

            <!-- AniList page link -->
            <a
              :href="media.siteUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#02a9ff]/10 border border-[#02a9ff]/30 text-[#02a9ff] text-xs font-bold hover:bg-[#02a9ff]/20 transition-all"
            >
              <span class="material-symbols-outlined text-[14px]">open_in_new</span>
              Lihat di AniList
            </a>
          </div>
        </div>

        <!-- ── Description ── -->
        <div class="mt-10 bg-[#1c1b1b] rounded-2xl p-6 border border-white/5">
          <div class="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-[#55d8e1]">description</span>
              Sinopsis
            </h2>
            <!-- Translate button -->
            <button
              v-if="!translatedDesc"
              @click="translateDesc"
              :disabled="isTranslating"
              class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
              :class="isTranslating ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#00adb5]/10 text-[#55d8e1] hover:bg-[#00adb5]/20'"
            >
              <span class="material-symbols-outlined text-[16px]" :class="isTranslating ? 'animate-spin' : ''">
                {{ isTranslating ? 'sync' : 'translate' }}
              </span>
              {{ isTranslating ? 'Menerjemahkan...' : 'Terjemahkan ke Indonesia' }}
            </button>
            <span v-else class="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold bg-emerald-500/10 px-3 py-1.5 rounded-lg">
              <span class="material-symbols-outlined text-[14px]">check_circle</span>
              Sudah diterjemahkan
            </span>
          </div>
          <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
            {{ translatedDesc || cleanHtml(media.description) }}
          </p>
        </div>

        <!-- ── Meta Grid ── -->
        <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-[#1c1b1b] border border-white/5 rounded-xl p-4">
            <p class="text-xs text-gray-500 mb-1">Mulai Terbit</p>
            <p class="text-sm font-bold text-white">{{ formatDate(media.startDate) }}</p>
          </div>
          <div class="bg-[#1c1b1b] border border-white/5 rounded-xl p-4">
            <p class="text-xs text-gray-500 mb-1">Selesai</p>
            <p class="text-sm font-bold text-white">{{ formatDate(media.endDate) }}</p>
          </div>
          <div class="bg-[#1c1b1b] border border-white/5 rounded-xl p-4">
            <p class="text-xs text-gray-500 mb-1">Total Chapter</p>
            <p class="text-sm font-bold text-white">{{ media.chapters || '?' }}</p>
          </div>
          <div class="bg-[#1c1b1b] border border-white/5 rounded-xl p-4">
            <p class="text-xs text-gray-500 mb-1">Popularitas</p>
            <p class="text-sm font-bold text-white">#{{ media.popularity?.toLocaleString() || 'N/A' }}</p>
          </div>
        </div>

        <!-- ── Tags ── -->
        <div v-if="media.tags?.length" class="mt-6">
          <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Tags</h3>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="tag in media.tags?.slice(0, 20)"
              :key="tag.name"
              class="px-2.5 py-1 rounded-full bg-[#2a2a2a] text-gray-400 text-xs hover:text-gray-200 transition-colors"
            >{{ tag.name }} <span class="text-gray-600">{{ tag.rank }}%</span></span>
          </div>
        </div>

        <!-- ── Other Links ── -->
        <div v-if="otherLinks.length" class="mt-6">
          <h3 class="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Link Lainnya</h3>
          <div class="flex flex-wrap gap-2">
            <a
              v-for="link in otherLinks"
              :key="link.url"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e1e1e] border border-white/5 text-gray-400 hover:text-white hover:border-white/20 text-xs font-medium transition-all"
            >
              <span class="material-symbols-outlined text-[13px]">link</span>
              {{ link.site }}
            </a>
          </div>
        </div>

        <!-- ── Chapter List (MangaDex Integration) ── -->
        <div class="mt-12 mb-8 bg-[#151515] rounded-2xl border border-white/5 overflow-hidden">
          <div class="p-6 border-b border-white/5 flex items-center justify-between flex-wrap gap-4 bg-[#1a1a1a]">
            <div>
              <h2 class="text-2xl font-black text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-[#55d8e1] text-3xl">menu_book</span>
                Daftar Chapter
              </h2>
              <p class="text-sm text-gray-400 mt-1">
                <span v-if="!userInteracted && activeLangLabel" class="text-[#00adb5] font-semibold mr-1">Otomatis: {{ activeLangLabel }} |</span>
                Terhubung dengan server baca MangaDex
              </p>
            </div>
            
            <div v-if="!mdMatchPending && mangadexId" class="flex items-center gap-3">
              <!-- Language Selector -->
              <div class="relative bg-[#252525] border border-white/5 rounded-lg flex items-center gap-2 px-3 py-2 hover:border-[#55d8e1]/50 transition-colors">
                <span class="material-symbols-outlined text-gray-400 text-[18px]">translate</span>
                <select v-model="selectedLang" class="bg-transparent text-xs font-bold text-gray-300 uppercase tracking-wider outline-none cursor-pointer appearance-none pr-6 w-full">
                  <option value="id" class="bg-[#1c1b1b] text-white">Bahasa Indonesia</option>
                  <option value="en" class="bg-[#1c1b1b] text-white">Bahasa Inggris</option>
                  <option value="all" class="bg-[#1c1b1b] text-white">Semua Bahasa</option>
                </select>
                <span class="material-symbols-outlined text-[16px] absolute right-2 text-gray-500 pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>

          <div class="p-4 md:p-6 min-h-[200px]">
            <!-- Loading Match -->
            <div v-if="mdMatchPending" class="flex flex-col items-center justify-center py-10 gap-3">
              <div class="w-8 h-8 border-4 border-[#00adb5] border-t-transparent rounded-full animate-spin"></div>
              <p class="text-gray-400 text-sm">Mencari chapter di database...</p>
            </div>

            <!-- Match Failed -->
            <div v-else-if="!mangadexId" class="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <span class="material-symbols-outlined text-4xl text-gray-600">search_off</span>
              <p class="text-gray-400 text-sm max-w-md">Tidak menemukan manga ini di database pembaca. Silakan gunakan Link Baca Resmi di atas.</p>
            </div>

            <!-- Chapters Loading -->
            <div v-else-if="feedLoading" class="flex flex-col items-center justify-center py-10 gap-3">
              <div class="w-8 h-8 border-4 border-[#55d8e1] border-t-transparent rounded-full animate-spin"></div>
              <p class="text-gray-400 text-sm">Memuat daftar chapter...</p>
            </div>

            <!-- Chapters Error -->
            <div v-else-if="feedError" class="flex flex-col items-center justify-center py-10 gap-2">
              <span class="material-symbols-outlined text-red-500 text-4xl">error</span>
              <p class="text-red-400 text-sm font-semibold">Gagal memuat chapter</p>
            </div>

            <!-- Chapters Empty -->
            <div v-else-if="chapterList.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
              <span class="material-symbols-outlined text-gray-500 text-4xl">book</span>
              <p class="text-gray-400 text-sm font-semibold">Belum ada chapter tersedia untuk bahasa ini.</p>
            </div>

            <!-- Chapter List -->
            <div v-else class="flex flex-col gap-2">
              <div
                v-for="chapter in chapterList"
                :key="chapter.id"
                @click="navigateToChapter(chapter.id)"
                class="group flex items-center justify-between p-4 rounded-xl bg-[#1c1c1c] border border-white/5 hover:bg-[#252525] hover:border-[#55d8e1]/30 cursor-pointer transition-all"
              >
                <div>
                  <h3 class="text-white font-bold text-sm md:text-base group-hover:text-[#55d8e1] transition-colors">
                    Chapter {{ chapter.attributes?.chapter || '?' }} 
                    <span v-if="chapter.attributes?.title" class="text-gray-400 font-normal ml-1 hidden md:inline">- {{ chapter.attributes.title }}</span>
                  </h3>
                  <div class="flex items-center gap-3 mt-1.5 text-xs text-gray-500 font-medium">
                    <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">group</span> {{ getScanlationGroup(chapter) }}</span>
                    <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span> {{ getFormattedDate(chapter.attributes?.publishAt) }}</span>
                  </div>
                </div>
                <div class="w-8 h-8 rounded-full bg-[#111] flex items-center justify-center text-gray-400 group-hover:bg-[#00adb5] group-hover:text-white transition-all shadow-sm">
                  <span class="material-symbols-outlined text-[18px]">play_arrow</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Recommendations ── -->
        <div v-if="recommendations.length" class="mt-10">
          <div class="flex items-center gap-3 mb-5">
            <span class="w-1.5 h-7 bg-gradient-to-b from-[#55d8e1] to-[#00adb5] rounded-full"></span>
            <h2 class="text-xl font-bold text-white">Rekomendasi Serupa</h2>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div
              v-for="rec in recommendations"
              :key="rec.id"
              @click="navigateTo(`/manhwa-anilist/${rec.id}`)"
              class="group cursor-pointer"
            >
              <div class="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#1e1e1e] border border-white/5 mb-2 transition-all group-hover:shadow-[0_0_15px_rgba(0,173,181,0.2)] group-hover:-translate-y-1">
                <img
                  :src="rec.coverImage?.large"
                  :alt="rec.title?.userPreferred"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div v-if="rec.averageScore" class="absolute bottom-2 right-2 bg-black/70 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <span class="material-symbols-outlined text-yellow-400 text-[11px]">star</span>
                  <span class="text-white text-[10px] font-bold">{{ rec.averageScore }}%</span>
                </div>
              </div>
              <p class="text-xs font-semibold text-gray-300 line-clamp-2 group-hover:text-[#55d8e1] transition-colors leading-tight">
                {{ rec.title?.english || rec.title?.userPreferred }}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
