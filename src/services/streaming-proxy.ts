/**
 * Streaming Proxy Service
 * Creates a local HTTP server to proxy YouTube video streams, bypassing CORS restrictions.
 * The renderer can request video streams through this proxy and play them in the video element.
 *
 * Handles HLS manifests, video segments, and range requests with proper timeout and retry logic.
 */

import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { request as httpsRequest, Agent as HttpsAgent } from 'https'
import { URL } from 'url'
import { Logger } from '../utils/logger'

const logger = Logger.getInstance()

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 30000

/** Maximum retry attempts for transient failures */
const MAX_RETRIES = 2

/** Retry delay in milliseconds */
const RETRY_DELAY = 500

/**
 * Reusable HTTPS agent with connection pooling for better performance.
 * keepAlive prevents socket hang up on subsequent requests to same host.
 */
const httpsAgent = new HttpsAgent({
  keepAlive: true,
  keepAliveMsecs: 3000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: REQUEST_TIMEOUT,
})

interface ProxyState {
  server: Server | null
  port: number
  isRunning: boolean
}

const state: ProxyState = {
  server: null,
  port: 0,
  isRunning: false,
}

/**
 * Start the streaming proxy server
 * Returns the port number the server is running on
 */
export async function startStreamingProxy(): Promise<number> {
  if (state.isRunning && state.server) {
    logger.info('Streaming proxy already running', { port: state.port })
    return state.port
  }

  return new Promise((resolve, reject) => {
    const server = createServer(handleRequest)

    // Listen on port 0 to get a random available port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        state.server = server
        state.port = address.port
        state.isRunning = true
        logger.info('Streaming proxy started', { port: state.port })
        resolve(state.port)
      } else {
        reject(new Error('Failed to get server address'))
      }
    })

    server.on('error', error => {
      logger.error('Streaming proxy server error', error)
      reject(error)
    })
  })
}

/**
 * Stop the streaming proxy server
 */
export async function stopStreamingProxy(): Promise<void> {
  if (!state.server) {
    return
  }

  return new Promise(resolve => {
    state.server!.close(() => {
      logger.info('Streaming proxy stopped')
      state.server = null
      state.port = 0
      state.isRunning = false
      resolve()
    })
  })
}

/**
 * Get the proxy URL for a given video stream URL
 */
export function getProxyUrl(streamUrl: string): string {
  if (!state.isRunning) {
    throw new Error('Streaming proxy is not running')
  }
  const encodedUrl = encodeURIComponent(streamUrl)
  return `http://127.0.0.1:${state.port}/stream?url=${encodedUrl}`
}

/**
 * Check if the proxy is running
 */
export function isProxyRunning(): boolean {
  return state.isRunning
}

/**
 * Get the proxy port
 */
export function getProxyPort(): number {
  return state.port
}

/**
 * Handle incoming proxy requests
 */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  // Add CORS headers for local requests
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${state.port}`)

  if (requestUrl.pathname === '/stream') {
    handleStreamRequest(req, res, requestUrl)
  } else if (requestUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', port: state.port }))
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
}

/**
 * Handle video stream proxy requests with retry logic for transient failures.
 * Supports HLS manifests, video segments, and range requests.
 */
function handleStreamRequest(req: IncomingMessage, res: ServerResponse, requestUrl: URL): void {
  const videoUrl = requestUrl.searchParams.get('url')

  if (!videoUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Missing url parameter')
    return
  }

  let decodedUrl: string
  try {
    decodedUrl = decodeURIComponent(videoUrl)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Invalid url parameter')
    return
  }

  // Validate the URL is a YouTube/Google video URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(decodedUrl)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    res.end('Invalid URL format')
    return
  }

  const allowedHosts = ['googlevideo.com', 'youtube.com', 'ytimg.com', 'ggpht.com']

  const isAllowedHost = allowedHosts.some(host => parsedUrl.hostname.endsWith(host) || parsedUrl.hostname === host)

  if (!isAllowedHost) {
    logger.warn('Blocked proxy request to non-YouTube host', { host: parsedUrl.hostname })
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Only YouTube video URLs are allowed')
    return
  }

  // Track if client has disconnected to avoid unnecessary work
  let clientDisconnected = false
  req.on('close', () => {
    clientDisconnected = true
  })

  // Forward range header if present (for seeking)
  const rangeHeader = req.headers.range

  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.youtube.com',
    Referer: 'https://www.youtube.com/',
    Connection: 'keep-alive',
  }

  if (rangeHeader) {
    headers['Range'] = rangeHeader
  }

  // Determine if this is an HLS manifest request (needs different handling)
  const isManifest =
    parsedUrl.hostname.includes('manifest') || decodedUrl.includes('/manifest/') || decodedUrl.includes('.m3u8')

  logger.info('Proxying video stream', {
    host: parsedUrl.hostname,
    hasRange: !!rangeHeader,
    range: rangeHeader?.substring(0, 50),
    isManifest,
  })

  // Execute proxy request with retry logic
  executeProxyRequest(decodedUrl, headers, res, clientDisconnected, 0, isManifest)
}

/**
 * Execute the proxy request with retry logic for transient failures.
 * Socket hang up errors and timeouts trigger retries.
 */
function executeProxyRequest(
  url: string,
  headers: Record<string, string>,
  res: ServerResponse,
  clientDisconnected: boolean,
  attempt: number,
  isManifest: boolean,
): void {
  // Don't start request if client already disconnected
  if (clientDisconnected) {
    logger.info('Client disconnected before proxy request started')
    return
  }

  // Don't retry if response already started
  if (res.headersSent) {
    return
  }

  const proxyReq = httpsRequest(
    url,
    {
      headers,
      agent: httpsAgent,
      timeout: REQUEST_TIMEOUT,
    },
    proxyRes => {
      // Handle redirects
      if (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307) {
        const redirectUrl = proxyRes.headers.location
        if (redirectUrl) {
          logger.info('Following redirect', { to: redirectUrl.substring(0, 100) })
          proxyRes.resume() // Consume response to free up socket
          executeProxyRequest(redirectUrl, headers, res, clientDisconnected, 0, isManifest)
          return
        }
      }

      // Forward response headers
      const responseHeaders: Record<string, string | string[]> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      }

      // Forward important headers from YouTube
      const forwardHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']

      for (const header of forwardHeaders) {
        const value = proxyRes.headers[header]
        if (value) {
          responseHeaders[header] = value
        }
      }

      // Set accept-ranges if not present (enables seeking)
      if (!responseHeaders['accept-ranges']) {
        responseHeaders['accept-ranges'] = 'bytes'
      }

      // For HLS manifests, ensure correct content type
      if (isManifest && !responseHeaders['content-type']) {
        responseHeaders['content-type'] = 'application/vnd.apple.mpegurl'
      }

      res.writeHead(proxyRes.statusCode || 200, responseHeaders)

      // Pipe the video data to client
      proxyRes.pipe(res)

      proxyRes.on('error', error => {
        logger.error('Proxy response stream error', error)
        if (!res.writableEnded) {
          res.end()
        }
      })

      proxyRes.on('end', () => {
        if (!res.writableEnded) {
          res.end()
        }
      })
    },
  )

  // Set request timeout
  proxyReq.setTimeout(REQUEST_TIMEOUT, () => {
    logger.warn('Proxy request timeout', { url: url.substring(0, 100), attempt })
    proxyReq.destroy(new Error('Request timeout'))
  })

  proxyReq.on('error', error => {
    const errorMsg = error.message

    // Check if this is a retryable error (socket hang up, ECONNRESET, timeout)
    const isRetryable =
      errorMsg.includes('socket hang up') ||
      errorMsg.includes('ECONNRESET') ||
      errorMsg.includes('ETIMEDOUT') ||
      errorMsg.includes('timeout')

    if (isRetryable && attempt < MAX_RETRIES && !res.headersSent) {
      logger.warn(`Retrying proxy request (${errorMsg})`, {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
      })

      // Retry after delay
      setTimeout(
        () => {
          if (!clientDisconnected && !res.headersSent) {
            executeProxyRequest(url, headers, res, clientDisconnected, attempt + 1, isManifest)
          }
        },
        RETRY_DELAY * (attempt + 1),
      )
      return
    }

    // Non-retryable error or max retries exceeded
    if (!isRetryable) {
      logger.error('Proxy request error (non-retryable)', error)
    } else {
      logger.error(`Proxy request failed after ${attempt + 1} retries`, error)
    }

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' })
    }
    if (!res.writableEnded) {
      res.end(`Proxy error: ${errorMsg}`)
    }
  })

  // Handle client disconnect - clean up the proxy request
  res.on('close', () => {
    if (!proxyReq.destroyed) {
      proxyReq.destroy()
    }
  })

  proxyReq.end()
}
