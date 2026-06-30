import { ref, onMounted } from 'vue'

export interface BookmarkedManga {
  id: string
  title: string
  coverUrl: string
  type?: string
}

const bookmarks = ref<BookmarkedManga[]>([])
const initialized = ref(false)

export function useBookmarks() {
  const loadBookmarks = () => {
    if (typeof window !== 'undefined') {
      const data = localStorage.getItem('mangastream_bookmarks')
      if (data) {
        try {
          bookmarks.value = JSON.parse(data)
        } catch (e) {
          console.error('Failed to parse bookmarks:', e)
        }
      }
      initialized.value = true
    }
  }

  const saveBookmarks = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mangastream_bookmarks', JSON.stringify(bookmarks.value))
    }
  }

  const addBookmark = (manga: BookmarkedManga) => {
    if (!bookmarks.value.some(item => item.id === manga.id)) {
      bookmarks.value.push(manga)
      saveBookmarks()
    }
  }

  const removeBookmark = (mangaId: string) => {
    bookmarks.value = bookmarks.value.filter(item => item.id !== mangaId)
    saveBookmarks()
  }

  const isBookmarked = (mangaId: string) => {
    return bookmarks.value.some(item => item.id === mangaId)
  }

  // Safely initialize bookmarks if in client environment
  if (typeof window !== 'undefined' && !initialized.value) {
    loadBookmarks()
  }

  onMounted(() => {
    if (!initialized.value) {
      loadBookmarks()
    }
  })

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    isBookmarked,
    loadBookmarks
  }
}
