<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const chapterId = route.params.id

// State
const qualityMode = ref('original') // 'original' or 'saver'
const mangaId = ref('')
const mangaTitle = ref('')
const chaptersFeed = ref([])
const currentChapterIndex = ref(-1)

// Fetch Chapter Detail (to get title, number, manga relation, and check if external)
const { 
  data: chapterData, 
  pending: chapterLoading, 
  error: chapterError 
} = await useFetch(`/api/mangadex/chapter/${chapterId}`, {
  query: { 'includes[]': ['manga'] }
})

const chapterAttrs = computed(() => chapterData.value?.data?.attributes)
const isExternal = computed(() => !!chapterAttrs.value?.externalUrl || chapterAttrs.value?.pages === 0)

// Fetch MD@Home image server details (only if NOT external)
// Use a reactive URL function; if external, return null to skip fetch
const { 
  data: serverData, 
  pending: serverLoading, 
  error: serverError 
} = await useFetch(() => isExternal.value ? null : `/api/mangadex/at-home/server/${chapterId}`)

// Once we have chapter info, determine manga ID and load list of all Indonesian chapters
watch(chapterData, async (newVal) => {
  if (!newVal?.data) return
  const mangaRelation = newVal.data.relationships?.find(r => r.type === 'manga')
  if (mangaRelation) {
    mangaId.value = mangaRelation.id
    
    // Fetch title of manga
    const titleObj = mangaRelation.attributes?.title
    if (titleObj) {
      mangaTitle.value = titleObj.id || titleObj.en || titleObj.ja || Object.values(titleObj)[0] || 'Manga'
    }

    // Fetch the list of Indonesian chapters to handle next/prev navigation
    // We do this purely on client to avoid hydration mismatch with async watch
    if (import.meta.client) {
      try {
        const feedRes = await $fetch(`/api/mangadex/manga/${mangaId.value}/feed`, {
          query: {
            limit: 100,
            'translatedLanguage[]': ['id'],
            'order[chapter]': 'asc' // Ascending to order chapters naturally
          }
        })
        chaptersFeed.value = feedRes.data || []
        currentChapterIndex.value = chaptersFeed.value.findIndex(c => c.id === chapterId)
      } catch (err) {
        console.error('Failed to load sibling chapters:', err)
      }
    }
  }
}, { immediate: true })

// If mounted on client, also fetch if we missed it during hydration
onMounted(async () => {
  if (mangaId.value && chaptersFeed.value.length === 0) {
    try {
      const feedRes = await $fetch(`/api/mangadex/manga/${mangaId.value}/feed`, {
        query: { limit: 100, 'translatedLanguage[]': ['id'], 'order[chapter]': 'asc' }
      })
      chaptersFeed.value = feedRes.data || []
      currentChapterIndex.value = chaptersFeed.value.findIndex(c => c.id === chapterId)
    } catch (err) {}
  }
})

// Image URLs construction
const imageUrls = computed(() => {
  if (isExternal.value || !serverData.value || !serverData.value.chapter) return []
  
  const baseUrl = serverData.value.baseUrl
  const hash = serverData.value.chapter.hash
  const pages = qualityMode.value === 'original' 
    ? serverData.value.chapter.data 
    : serverData.value.chapter.dataSaver
  
  const folder = qualityMode.value === 'original' ? 'data' : 'data-saver'
  
  return (pages || []).map(fileName => `${baseUrl}/${folder}/${hash}/${fileName}`)
})

// Navigation helpers
const prevChapter = computed(() => {
  if (currentChapterIndex.value > 0) return chaptersFeed.value[currentChapterIndex.value - 1]
  return null
})
const nextChapter = computed(() => {
  if (currentChapterIndex.value >= 0 && currentChapterIndex.value < chaptersFeed.value.length - 1) {
    return chaptersFeed.value[currentChapterIndex.value + 1]
  }
  return null
})

const navigateToChapter = (id) => navigateTo(`/chapter/${id}`, { replace: true })
const goBack = () => {
  if (window.history.state && window.history.state.back) {
    router.back()
  } else {
    mangaId.value ? navigateTo(`/manga/detail/${mangaId.value}`) : navigateTo('/')
  }
}

// Track page loading status
const loadedPages = ref({})
const onImageLoad = (index) => {
  loadedPages.value[index] = true
}
</script>

<template>
  <div class="bg-[#0f0f0f] text-[#e5e2e1] min-h-screen font-sans overflow-x-hidden selection:bg-[#55d8e1]/30 selection:text-[#55d8e1]">
    
    <!-- Reader Top Header Bar -->
    <header class="fixed top-0 w-full z-50 bg-[#131313]/90 backdrop-blur-md px-4 py-3 flex items-center justify-between border-b border-white/5">
      <div class="flex items-center gap-3 min-w-0">
        <button @click="goBack" class="w-9 h-9 rounded-full bg-[#1c1b1b] hover:bg-[#353534] flex items-center justify-center text-white transition-all flex-none">
          <span class="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <div class="min-w-0">
          <h2 class="text-sm font-bold truncate text-gray-200">
            {{ mangaTitle || 'Kembali Ke Detail' }}
          </h2>
          <p class="text-xs text-[#55d8e1] font-semibold truncate mt-0.5">
            Chapter {{ chapterAttrs?.chapter || '...' }} 
            <span class="text-gray-400 font-normal" v-if="chapterAttrs?.title">
              - {{ chapterAttrs.title }}
            </span>
          </p>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-2">
        <!-- Quality Toggle -->
        <button 
          v-if="!isExternal"
          @click="qualityMode = qualityMode === 'original' ? 'saver' : 'original'"
          class="bg-[#1c1b1b] border border-white/5 hover:border-[#55d8e1] px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 text-gray-300"
        >
          <span class="material-symbols-outlined text-[14px]">speed</span>
          {{ qualityMode === 'original' ? 'Ori' : 'Hemat' }}
        </button>

        <!-- Prev / Next Header shortcuts -->
        <button 
          :disabled="!prevChapter"
          @click="navigateToChapter(prevChapter.id)"
          :class="!prevChapter ? 'opacity-30 cursor-not-allowed' : 'hover:text-[#55d8e1]'"
          class="w-9 h-9 rounded-full bg-[#1c1b1b] flex items-center justify-center text-white transition-all flex-none"
        >
          <span class="material-symbols-outlined text-[20px]">navigate_before</span>
        </button>
        <button 
          :disabled="!nextChapter"
          @click="navigateToChapter(nextChapter.id)"
          :class="!nextChapter ? 'opacity-30 cursor-not-allowed' : 'hover:text-[#55d8e1]'"
          class="w-9 h-9 rounded-full bg-[#1c1b1b] flex items-center justify-center text-white transition-all flex-none"
        >
          <span class="material-symbols-outlined text-[20px]">navigate_next</span>
        </button>
      </div>
    </header>

    <!-- Main Image Reader Container -->
    <main class="pt-20 pb-24 px-2 flex flex-col items-center">
      
      <!-- Top loading state -->
      <div v-if="chapterLoading || (serverLoading && !isExternal)" class="py-24 flex flex-col items-center gap-4">
        <div class="w-12 h-12 border-4 border-[#55d8e1] border-t-transparent rounded-full animate-spin"></div>
        <p class="text-gray-400 text-sm">Menghubungkan ke server MangaDex...</p>
      </div>

      <!-- External Chapter State -->
      <div v-else-if="isExternal" class="py-24 flex flex-col items-center gap-4 px-6 text-center max-w-md w-full">
        <span class="material-symbols-outlined text-[#55d8e1] text-6xl block mb-2">open_in_new</span>
        <h3 class="text-xl font-bold text-white">Chapter Eksternal</h3>
        <p class="text-gray-400 text-sm">
          Chapter ini tidak dihosting oleh MangaDex, melainkan disediakan di platform aslinya (misal: Webtoon, Tapas).
        </p>
        <a 
          :href="chapterAttrs?.externalUrl || '#'"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-4 bg-[#00adb5] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#55d8e1] hover:-translate-y-0.5 transition-all w-full flex items-center justify-center gap-2 shadow-lg"
        >
          Baca di Situs Resmi
          <span class="material-symbols-outlined text-[18px]">open_in_new</span>
        </a>
      </div>

      <!-- Error State -->
      <div v-else-if="chapterError || serverError" class="py-24 flex flex-col items-center gap-4 px-6 text-center">
        <span class="material-symbols-outlined text-red-400 text-6xl">cloud_off</span>
        <h3 class="text-xl font-bold text-white">Gagal Memuat Halaman Chapter</h3>
        <p class="text-gray-400 max-w-md text-sm">
          Node server MD@Home tidak merespon atau chapter ini tidak tersedia. Silakan segarkan halaman.
        </p>
        <button @click="router.go(0)" class="bg-[#00adb5] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-[#55d8e1] transition-all">Segarkan</button>
      </div>

      <!-- Scroll Reader View -->
      <div v-else-if="imageUrls.length > 0" class="w-full max-w-3xl flex flex-col items-center gap-1.5 mt-4">
        <div 
          v-for="(url, index) in imageUrls" 
          :key="url"
          class="w-full relative bg-[#151515] flex justify-center items-center overflow-hidden min-h-[300px] md:min-h-[500px]"
        >
          <!-- Skeleton image loader -->
          <div v-if="!loadedPages[index]" class="absolute inset-0 flex flex-col justify-center items-center bg-[#181818] gap-3">
            <div class="w-8 h-8 border-2 border-[#55d8e1]/30 border-t-[#55d8e1] rounded-full animate-spin"></div>
            <p class="text-gray-500 text-xs font-semibold">Halaman {{ index + 1 }} / {{ imageUrls.length }}</p>
          </div>

          <img 
            :src="url" 
            :alt="`Halaman ${index + 1}`"
            @load="onImageLoad(index)"
            class="w-full h-auto object-contain transition-opacity duration-300 relative z-10"
            :class="loadedPages[index] ? 'opacity-100' : 'opacity-0'"
            loading="lazy"
          />
        </div>
      </div>

      <!-- Empty Reader State (No images but not external) -->
      <div v-else-if="!pending" class="py-24 flex flex-col items-center gap-4 px-6 text-center">
        <span class="material-symbols-outlined text-gray-500 text-6xl">broken_image</span>
        <h3 class="text-xl font-bold text-white">Tidak ada gambar</h3>
        <p class="text-gray-400 max-w-md text-sm">Chapter ini kosong dan tidak memiliki halaman untuk ditampilkan.</p>
      </div>

      <!-- Footer Navigation Controls -->
      <div class="w-full max-w-xl mt-12 flex flex-col items-center gap-6 px-4">
        
        <div v-if="imageUrls.length > 0" class="text-center text-sm text-gray-400">
          Selesai membaca. Anda telah mencapai akhir chapter.
        </div>

        <div class="flex w-full gap-4 justify-between">
          <button 
            :disabled="!prevChapter"
            @click="navigateToChapter(prevChapter.id)"
            :class="!prevChapter ? 'opacity-30 cursor-not-allowed bg-gray-900 border-none text-gray-600' : 'bg-[#1c1b1b] border border-white/5 hover:border-[#55d8e1] text-white hover:text-[#55d8e1]'"
            class="flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <span class="material-symbols-outlined">navigate_before</span>
            Prev Chapter
          </button>
          
          <button 
            :disabled="!nextChapter"
            @click="navigateToChapter(nextChapter.id)"
            :class="!nextChapter ? 'opacity-30 cursor-not-allowed bg-gray-900 border-none text-gray-600' : 'bg-[#00adb5] text-white hover:bg-[#55d8e1]'"
            class="flex-1 py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            Next Chapter
            <span class="material-symbols-outlined">navigate_next</span>
          </button>
        </div>

        <button 
          @click="goBack" 
          class="text-gray-400 hover:text-white text-sm font-semibold flex items-center gap-1.5 transition-colors mt-2"
        >
          <span class="material-symbols-outlined text-[18px]">list_alt</span>
          Kembali ke Daftar Chapter
        </button>
      </div>

    </main>
  </div>
</template>

<style scoped>
/* Disable copy & drag for cleaner reading experience */
img {
  -webkit-user-select: none;
  -khtml-user-select: none;
  -moz-user-select: none;
  -o-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
  user-drag: none;
}
</style>
