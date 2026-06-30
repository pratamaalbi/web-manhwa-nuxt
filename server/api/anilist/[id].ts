export default defineEventHandler(async (event) => {
  const id = parseInt(event.context.params?.id as string)

  if (!id || isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AniList media ID' })
  }

  const graphqlQuery = `
    query ($id: Int) {
      Media(id: $id, type: MANGA) {
        id
        title {
          english
          userPreferred
          native
          romaji
        }
        coverImage {
          extraLarge
          large
        }
        bannerImage
        status
        description
        averageScore
        meanScore
        popularity
        favourites
        genres
        tags {
          name
          category
          rank
        }
        externalLinks {
          site
          url
          type
          icon
          color
        }
        siteUrl
        startDate { year month day }
        endDate   { year month day }
        chapters
        volumes
        countryOfOrigin
        isAdult
        recommendations(perPage: 6, sort: [RATING_DESC]) {
          nodes {
            mediaRecommendation {
              id
              title { userPreferred english }
              coverImage { large }
              averageScore
              status
            }
          }
        }
      }
    }
  `

  try {
    const response = await $fetch<any>('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: { query: graphqlQuery, variables: { id } }
    })
    return response.data
  } catch (error: any) {
    console.error('AniList detail fetch error:', error)
    throw createError({
      statusCode: error.response?.status || 500,
      statusMessage: error.message || 'Failed to fetch AniList detail'
    })
  }
})
