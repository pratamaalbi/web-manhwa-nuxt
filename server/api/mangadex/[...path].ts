const dnsCache = new Map<string, string>()

// We only override DNS resolver in local Node.js environment where ISP blocks MangaDex.
// Cloudflare's own servers resolve MangaDex without issues, so this is bypassed in production.
if (process.env.NODE_ENV === 'development') {
  Promise.all([
    import('node:dns'),
    import('node:https')
  ]).then(([dnsModule, httpsModule]) => {
    const dns = dnsModule.default || dnsModule
    const https = httpsModule.default || httpsModule
    
    const originalLookup = dns.lookup

    const resolveDoH = async (hostname: string): Promise<string | null> => {
      if (dnsCache.has(hostname)) {
        return dnsCache.get(hostname)!
      }
      return new Promise((resolve) => {
        const options = {
          hostname: '1.1.1.1',
          path: `/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
          headers: {
            'Accept': 'application/dns-json',
            'Host': 'cloudflare-dns.com'
          },
          timeout: 3000
        }
        const req = https.get(options, (res: any) => {
          let data = ''
          res.on('data', (chunk: any) => { data += chunk })
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              const answers = json.Answer || []
              const aRecords = answers.filter((ans: any) => ans.type === 1)
              if (aRecords.length > 0) {
                const ip = aRecords[0].data
                dnsCache.set(hostname, ip)
                resolve(ip)
                return
              }
            } catch (e) {}
            resolve(null)
          })
        })
        req.on('error', () => resolve(null))
        req.on('timeout', () => {
          req.destroy()
          resolve(null)
        })
      })
    }

    dns.lookup = (hostname: string, options: any, callback: any) => {
      if (typeof options === 'function') {
        callback = options
        options = {}
      }

      if (hostname.endsWith('mangadex.org')) {
        resolveDoH(hostname).then((ip) => {
          if (ip) {
            if (options.all) {
              callback(null, [{ address: ip, family: 4 }])
            } else {
              callback(null, ip, 4)
            }
          } else {
            originalLookup(hostname, options, callback)
          }
        }).catch(() => {
          originalLookup(hostname, options, callback)
        })
      } else {
        originalLookup(hostname, options, callback)
      }
    }
  }).catch(err => {
    console.warn('DNS lookup override skipped:', err.message)
  })
}

export default defineEventHandler(async (event) => {
  // Capture dynamic path parameters
  const path = event.context.params?.path || ''
  const query = getQuery(event)

  const targetUrl = `https://api.mangadex.org/${path}`

  try {
    const response = await $fetch(targetUrl, {
      query,
      headers: {
        'User-Agent': 'MangaStream/1.0.0 (https://github.com/mangastream)'
      }
    })
    return response
  } catch (error: any) {
    console.error(`Error fetching from MangaDex API (${targetUrl}):`, error)
    throw createError({
      statusCode: error.status || 500,
      statusMessage: error.message || 'MangaDex API proxy request failed'
    })
  }
})
