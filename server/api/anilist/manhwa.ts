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

  const variables = { page, perPage }

  try {
    const response = await $fetch<any>('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: {
        query: graphqlQuery,
        variables
      }
    })
    return response.data
  } catch (error: any) {
    console.error('Error fetching from AniList API:', error)
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.message || 'Failed to fetch from AniList API'
    })
  }
})
