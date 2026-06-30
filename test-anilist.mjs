const query = `query {
  Page(page: 1, perPage: 3) {
    media(type: MANGA, countryOfOrigin: "KR", sort: POPULARITY_DESC) {
      id
      title { english }
    }
  }
}`

fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
}).then(r => {
  console.log('STATUS:', r.status)
  return r.text()
}).then(t => console.log(t.slice(0, 500)))
.catch(e => console.error('ERR:', e.message))
