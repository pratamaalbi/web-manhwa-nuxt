import https from 'node:https'
import dns from 'node:dns'

// Reuse the DoH resolver logic since uploads.mangadex.org is the same domain
const dnsCache = new Map<string, string>()
const originalLookup = dns.lookup

async function resolveDoH(hostname: string): Promise<string | null> {
  if (dnsCache.has(hostname)) return dnsCache.get(hostname)!
  return new Promise((resolve) => {
    const options = {
      hostname: '1.1.1.1',
      path: `/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      headers: { 'Accept': 'application/dns-json', 'Host': 'cloudflare-dns.com' },
      timeout: 3000
    }
    const req = https.get(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          const aRecords = (json.Answer || []).filter((a: any) => a.type === 1)
          if (aRecords.length > 0) {
            dnsCache.set(hostname, aRecords[0].data)
            resolve(aRecords[0].data)
            return
          }
        } catch {}
        resolve(null)
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

// Apply DoH override for mangadex.org (covers both api. and uploads. subdomains)
dns.lookup = (hostname: string, options: any, callback: any) => {
  if (typeof options === 'function') { callback = options; options = {} }
  if (hostname.endsWith('mangadex.org')) {
    resolveDoH(hostname).then((ip) => {
      if (ip) {
        options.all
          ? callback(null, [{ address: ip, family: 4 }])
          : callback(null, ip, 4)
      } else {
        originalLookup(hostname, options, callback)
      }
    }).catch(() => originalLookup(hostname, options, callback))
  } else {
    originalLookup(hostname, options, callback)
  }
}

export default defineEventHandler(async (event) => {
  // URL format: /api/cover-proxy?url=https://uploads.mangadex.org/covers/...
  const query = getQuery(event)
  const imageUrl = query.url as string

  if (!imageUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Missing url query parameter' })
  }

  // Security: only allow proxying from uploads.mangadex.org
  if (!imageUrl.startsWith('https://uploads.mangadex.org/')) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: only mangadex.org images allowed' })
  }

  try {
    // Fetch the image from the remote server
    const response = await $fetch.raw(imageUrl, {
      headers: {
        'User-Agent': 'MangaStream/1.0.0',
        'Referer': 'https://mangadex.org/'
      }
    })

    // Pass through content-type and cache headers so the browser caches properly
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    setHeader(event, 'Content-Type', contentType)
    setHeader(event, 'Cache-Control', 'public, max-age=86400') // Cache for 24 hours
    setHeader(event, 'Access-Control-Allow-Origin', '*')

    return response._data
  } catch (error: any) {
    console.error(`[cover-proxy] Error fetching image (${imageUrl}):`, error?.message)
    throw createError({
      statusCode: error?.response?.status || 500,
      statusMessage: 'Failed to proxy image'
    })
  }
})
