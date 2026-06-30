const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchAniList(body: object, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await $fetch<any>('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; MangaStream/1.0)',
          'Origin': 'https://anilist.co',
          'Referer': 'https://anilist.co/'
        },
        body
      })
      return response
    } catch (error: any) {
      const status = error.response?.status || error.status
      // Rate limited or forbidden — wait and retry
      if ((status === 429 || status === 403) && attempt < retries) {
        const delay = attempt * 1500
        console.warn(`AniList rate limited (${status}), retrying in ${delay}ms (attempt ${attempt}/${retries})...`)
        await sleep(delay)
        continue
      }
      throw error
    }
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = parseInt(query.page as string) || 1
  const perPage = parseInt(query.perPage as string) || 15

  const graphqlQuery = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
          perPage
        }
        media(type: MANGA, countryOfOrigin: "KR", sort: POPULARITY_DESC) {
          id
          title {
            english
            userPreferred
          }
          coverImage {
            large
          }
          status
          description
          averageScore
        }
      }
    }
  `

  try {
    const response = await fetchAniList({ query: graphqlQuery, variables: { page, perPage } })
    return response.data
  } catch (error: any) {
    const status = error.response?.status || error.status || 500
    console.error(`AniList API error (${status}):`, error.message)
    throw createError({
      statusCode: status,
      statusMessage: status === 403 || status === 429
        ? 'AniList API rate limit reached. Please try again in a moment.'
        : error.message || 'Failed to fetch from AniList API'
    })
  }
})
