// SSL certificate checker via HTTPS HEAD request

import https from 'https'

export interface SslResult {
  valid: boolean
  expiresAt: string | null
}

export async function checkSsl(domain: string): Promise<SslResult> {
  const cleanDomain = domain
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim()

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      req.destroy()
      resolve({ valid: false, expiresAt: null })
    }, 5000)

    const req = https.get(
      {
        hostname: cleanDomain,
        port: 443,
        path: '/',
        method: 'HEAD',
        rejectUnauthorized: true,
        timeout: 5000,
      },
      (res) => {
        clearTimeout(timeout)
        try {
          // Access the TLSSocket to retrieve the peer certificate
          const socket = res.socket as import('tls').TLSSocket
          if (typeof socket.getPeerCertificate !== 'function') {
            resolve({ valid: false, expiresAt: null })
            return
          }

          const cert = socket.getPeerCertificate()
          if (!cert || !cert.valid_to) {
            resolve({ valid: false, expiresAt: null })
            return
          }

          // cert.valid_to is a date string like "Mar 15 12:00:00 2026 GMT"
          const expiresDate = new Date(cert.valid_to)
          const now = new Date()

          if (isNaN(expiresDate.getTime()) || expiresDate < now) {
            resolve({ valid: false, expiresAt: cert.valid_to ?? null })
            return
          }

          resolve({
            valid: true,
            expiresAt: expiresDate.toISOString(),
          })
        } catch {
          resolve({ valid: false, expiresAt: null })
        } finally {
          res.destroy()
        }
      }
    )

    req.on('error', () => {
      clearTimeout(timeout)
      resolve({ valid: false, expiresAt: null })
    })

    req.on('timeout', () => {
      clearTimeout(timeout)
      req.destroy()
      resolve({ valid: false, expiresAt: null })
    })

    req.end()
  })
}
