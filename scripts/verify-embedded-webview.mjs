import { access } from 'node:fs/promises'
import process from 'node:process'
import { chromium } from 'playwright-core'

const baseUrl = process.env.OWCS_STATIC_PREVIEW_URL || 'http://127.0.0.1:4174/'
const chromeCandidates = [
  process.env.CHROME_PATH,
  `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA || ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean)

let executablePath
for (const candidate of chromeCandidates) {
  try {
    await access(candidate)
    executablePath = candidate
    break
  } catch {
    // Try the next installed browser.
  }
}
if (!executablePath) throw new Error('未找到 Chrome/Edge；可通过 CHROME_PATH 指定浏览器')

const browser = await chromium.launch({ executablePath, headless: true })
try {
  const page = await browser.newPage({
    // The host app's own top/bottom chrome leaves a much shorter WebView than
    // the physical screen, which is where nested scrolling used to fail.
    viewport: { width: 390, height: 520 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; OWCS App Build/1; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36'
  })
  await page.goto(`${baseUrl}#/visualize`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('.vis-body').waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByRole('tab', { name: '赛程列表' }).click()
  await page.locator('.schedule-shell').waitFor({ state: 'visible', timeout: 60_000 })

  const metrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement
    const tabContent = document.querySelector('.tab-content')
    const eventContext = document.querySelector('.mobile-event-context')
    const dimensions = selector => {
      const element = document.querySelector(selector)
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        height: style.height,
        overflowY: style.overflowY,
        flex: style.flex
      }
    }
    window.scrollTo(0, 0)
    const eventTop = eventContext.getBoundingClientRect().top
    const before = scrollingElement.scrollTop
    window.scrollTo(0, Math.min(180, Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight)))
    return {
      embeddedClass: document.documentElement.classList.contains('is-embedded-webview'),
      before,
      after: scrollingElement.scrollTop,
      documentScrollable: scrollingElement.scrollHeight > scrollingElement.clientHeight,
      tabOverflowY: getComputedStyle(tabContent).overflowY,
      tabScrollTop: tabContent.scrollTop,
      eventTop,
      eventPaddingTop: getComputedStyle(eventContext).paddingTop,
      dimensions: {
        html: dimensions('html'),
        body: dimensions('body'),
        app: dimensions('#app'),
        layout: dimensions('.app-layout'),
        wrapper: dimensions('.app-content-wrapper'),
        main: dimensions('.app-main'),
        visualize: dimensions('.visualize-container'),
        content: dimensions('.vis-content'),
        bodyContent: dimensions('.vis-body'),
        tab: dimensions('.tab-content'),
        schedule: dimensions('.schedule-shell')
      }
    }
  })

  if (!metrics.embeddedClass) throw new Error(`未识别 Android WebView: ${JSON.stringify(metrics)}`)
  if (metrics.tabOverflowY !== 'visible' || metrics.tabScrollTop !== 0) {
    throw new Error(`WebView 仍在使用内层滚动: ${JSON.stringify(metrics)}`)
  }
  if (!metrics.documentScrollable || metrics.after <= metrics.before) {
    throw new Error(`WebView 无法页面级纵向滚动: ${JSON.stringify(metrics)}`)
  }
  if (metrics.eventPaddingTop !== '7px') {
    throw new Error(`WebView 重复应用顶部安全区: ${JSON.stringify(metrics)}`)
  }
  if (Math.abs(metrics.eventTop) > 1) {
    throw new Error(`WebView 内容顶部仍有额外留白: ${JSON.stringify(metrics)}`)
  }

  const browserPage = await browser.newPage({ viewport: { width: 390, height: 520 } })
  await browserPage.goto(`${baseUrl}#/visualize`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await browserPage.locator('.vis-body').waitFor({ state: 'visible', timeout: 60_000 })
  await browserPage.getByRole('tab', { name: '赛程列表' }).click()
  await browserPage.locator('.schedule-shell').waitFor({ state: 'visible', timeout: 60_000 })
  const browserMetrics = await browserPage.locator('.tab-content').evaluate(element => {
    element.scrollTop = 0
    const before = element.scrollTop
    element.scrollTop = Math.min(180, Math.max(0, element.scrollHeight - element.clientHeight))
    return {
      embeddedClass: document.documentElement.classList.contains('is-embedded-webview'),
      before,
      after: element.scrollTop,
      scrollable: element.scrollHeight > element.clientHeight,
      overflowY: getComputedStyle(element).overflowY
    }
  })
  if (browserMetrics.embeddedClass || browserMetrics.overflowY !== 'auto') {
    throw new Error(`普通浏览器错误进入 WebView 模式: ${JSON.stringify(browserMetrics)}`)
  }
  if (browserMetrics.scrollable && browserMetrics.after <= browserMetrics.before) {
    throw new Error(`普通浏览器内层滚动回归: ${JSON.stringify(browserMetrics)}`)
  }

  console.log(`[embedded-webview] passed ${JSON.stringify({ webView: metrics, browser: browserMetrics })}`)
} finally {
  await browser.close()
}
