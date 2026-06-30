export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const title = query.title as string
  const anilistId = query.anilistId as string

  if (!title || !anilistId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing title or anilistId' })
  }

  try {
    // Search MangaDex for the title, filtering by Korean origin to narrow down
    const searchUrl = `/api/mangadex/manga`
    const res = await $fetch<any>(searchUrl, {
      query: {
        title,
        limit: 10,
        'order[relevance]': 'desc',
        'originalLanguage[]': ['ko']
      }
    })

    const results = res?.data || []
    
    // 1. Try to find an exact match via links.al
    let match = results.find((m: any) => m.attributes?.links?.al === anilistId)

    // 2. If no exact match by ID, fallback to the most relevant result 
    // (since MangaDex search is already ordered by relevance and filtered by KR)
    if (!match && results.length > 0) {
      match = results[0]
    }

    if (match) {
      return { mangadexId: match.id }
    } else {
      return { mangadexId: null }
    }
  } catch (error: any) {
    console.error('MangaDex match error:', error)
    return { mangadexId: null }
  }
})
