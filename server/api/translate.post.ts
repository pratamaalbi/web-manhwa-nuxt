export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { text, targetLang = 'id', sourceLang = 'en' } = body

  if (!text) {
    return { translatedText: '' }
  }

  try {
    const encodedText = encodeURIComponent(text)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodedText}`
    
    const response = await $fetch<any[]>(url)
    
    // Google Translate API returns a nested array
    // e.g. [[["Terjemahan ","Translation "], ...], ...]
    if (Array.isArray(response) && Array.isArray(response[0])) {
      const translatedText = response[0].map((item: any) => item[0]).join('')
      return { translatedText }
    }
    
    // Fallback if the format is unexpected
    return { translatedText: text }
  } catch (error) {
    console.error('Google Translate API error (possibly rate limited):', error)
    // Graceful fallback to original text if limited/failed
    return { translatedText: text }
  }
})
