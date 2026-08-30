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
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; OWCS App Build/1; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36'
  })
  await page.route('**/static-data/api-cache.json', async route => {
    await new Promise(resolve => setTimeout(resolve, 350))
    await route.continue()
  })
  await page.goto(`${baseUrl}#/visualize`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.locator('.page-loading').waitFor({ state: 'visible', timeout: 10_000 })
  const loadingMetrics = await page.evaluate(() => {
    const loading = document.querySelector('.loading-panel').getBoundingClientRect()
    const content = document.querySelector('.vis-content').getBoundingClientRect()
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || ''
    return {
      contentHeight: content.height,
      loadingCenterY: loading.top + loading.height / 2,
      viewportCenterY: window.innerHeight / 2,
      viewport
    }
  })
  if (loadingMetrics.contentHeight < 500 || Math.abs(loadingMetrics.loadingCenterY - loadingMetrics.viewportCenterY) > 4) {
    throw new Error(`WebView loading position is incorrect: ${JSON.stringify(loadingMetrics)}`)
  }
  if (!/user-scalable\s*=\s*no/i.test(loadingMetrics.viewport) || !/maximum-scale\s*=\s*1(?:\.0)?/i.test(loadingMetrics.viewport)) {
    throw new Error(`WebView zoom is not disabled by viewport: ${JSON.stringify(loadingMetrics)}`)
  }
  await page.evaluate(() => {
    document.body.style.minHeight = 'calc(100dvh + 300px)'
    window.scrollTo(0, 180)
  })
  await page.locator('.vis-body').waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForTimeout(320)
  const postLoadScrollTop = await page.evaluate(() => document.scrollingElement.scrollTop)
  if (postLoadScrollTop !== 0) {
    throw new Error(`WebView did not reset the restored scroll position after loading: ${postLoadScrollTop}`)
  }
  await page.evaluate(() => {
    document.body.style.removeProperty('min-height')
    window.scrollTo(0, 0)
  })
  await page.locator('.mobile-season-select-trigger').click()
  await page.locator('.mobile-season-drawer').waitFor({ state: 'visible', timeout: 10_000 })
  const seasonPickerOrder = await page.locator('.mobile-season-group').evaluateAll(groups => groups.map(group => ({
    label: group.querySelector('h2')?.textContent?.trim() || '',
    ids: [...group.querySelectorAll('.mobile-season-option')].map(option => Number(option.dataset.seasonId))
  })))
  const flattenedSeasonIds = seasonPickerOrder.flatMap(group => group.ids)
  if (flattenedSeasonIds.some((id, index) => index > 0 && id >= flattenedSeasonIds[index - 1])) {
    throw new Error(`赛事选择器未按 ID 从新到旧排列: ${JSON.stringify(seasonPickerOrder)}`)
  }
  const completedSeasonOption = page.locator('.mobile-season-option').filter({ hasText: '已结束' }).first()
  if (await completedSeasonOption.count()) {
    const completedSeasonName = (await completedSeasonOption.locator('strong').textContent())?.trim() || ''
    await completedSeasonOption.click()
    await page.waitForFunction(name => document.querySelector('.mobile-event-name')?.textContent?.trim() === name, completedSeasonName)
  } else {
    await page.keyboard.press('Escape')
  }
  await page.locator('.mobile-season-drawer').waitFor({ state: 'hidden', timeout: 10_000 })
  await page.locator('.vis-body').waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByRole('tab', { name: '赛程列表' }).evaluate(element => element.click())
  await page.locator('.schedule-shell').waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForTimeout(320)
  await page.evaluate(() => {
    document.activeElement?.blur()
    window.scrollTo(0, 0)
    document.scrollingElement.scrollTop = 0
  })
  await page.waitForTimeout(50)

  const beforeGesture = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement
    const tabContent = document.querySelector('.tab-content')
    const eventContext = document.querySelector('.mobile-event-context')
    const tabsContext = document.querySelector('.vis-tabs-container')
    return {
      documentScrollTop: scrollingElement.scrollTop,
      eventTop: eventContext.getBoundingClientRect().top,
      tabsTop: tabsContext.getBoundingClientRect().top,
      tabScrollTop: tabContent.scrollTop
    }
  })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 195, y: 430 }]
  })
  for (const y of [390, 350, 310, 270, 230, 190]) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 195, y }]
    })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  })
  await page.waitForTimeout(250)

  const metrics = await page.evaluate(beforeGesture => {
    const scrollingElement = document.scrollingElement
    const tabContent = document.querySelector('.tab-content')
    const eventContext = document.querySelector('.mobile-event-context')
    const tabsContext = document.querySelector('.vis-tabs-container')
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
    return {
      embeddedClass: document.documentElement.classList.contains('is-embedded-webview'),
      beforeGesture,
      documentAfterGesture: scrollingElement.scrollTop,
      documentScrollable: scrollingElement.scrollHeight > scrollingElement.clientHeight,
      tabOverflowY: getComputedStyle(tabContent).overflowY,
      tabScrollTopAfterGesture: tabContent.scrollTop,
      eventPosition: getComputedStyle(eventContext).position,
      tabsPosition: getComputedStyle(tabsContext).position,
      eventTopAfterGesture: eventContext.getBoundingClientRect().top,
      tabsTopAfterGesture: tabsContext.getBoundingClientRect().top,
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
      },
      scheduleBounds: (() => {
        const bounds = document.querySelector('.schedule-shell').getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, viewportWidth: window.innerWidth }
      })()
    }
  }, beforeGesture)

  if (!metrics.embeddedClass) throw new Error(`未识别 Android WebView: ${JSON.stringify(metrics)}`)
  if (metrics.beforeGesture.documentScrollTop !== 0) {
    throw new Error(`WebView did not reset its initial scroll position: ${JSON.stringify(metrics)}`)
  }
  if (!metrics.documentScrollable || metrics.documentAfterGesture <= metrics.beforeGesture.documentScrollTop) {
    throw new Error(`WebView 真实触摸手势无法滚动内容: ${JSON.stringify(metrics)}`)
  }
  if (metrics.tabOverflowY !== 'visible' || metrics.tabScrollTopAfterGesture !== 0) {
    throw new Error(`WebView 仍在依赖失效的内层滚动: ${JSON.stringify(metrics)}`)
  }
  if (metrics.eventPosition !== 'fixed' || metrics.tabsPosition !== 'fixed') {
    throw new Error(`WebView 固定事件栏或 Tab 未生效: ${JSON.stringify(metrics)}`)
  }
  if (metrics.eventPaddingTop !== '7px') {
    throw new Error(`WebView 重复应用顶部安全区: ${JSON.stringify(metrics)}`)
  }
  if (Math.abs(metrics.beforeGesture.eventTop) > 1 || Math.abs(metrics.eventTopAfterGesture) > 1) {
    throw new Error(`WebView 内容顶部仍有额外留白: ${JSON.stringify(metrics)}`)
  }
  if (Math.abs(metrics.beforeGesture.tabsTop - 66) > 1 || Math.abs(metrics.tabsTopAfterGesture - 66) > 1) {
    throw new Error(`WebView Tab 未固定在事件栏下方: ${JSON.stringify(metrics)}`)
  }
  if (Math.abs(metrics.scheduleBounds.left) > 1 || Math.abs(metrics.scheduleBounds.right - metrics.scheduleBounds.viewportWidth) > 1) {
    throw new Error(`WebView 赛程列表未贴齐视口边缘: ${JSON.stringify(metrics)}`)
  }

  const browserPage = await browser.newPage({ viewport: { width: 390, height: 520 } })
  await browserPage.goto(`${baseUrl}#/visualize`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await browserPage.locator('.vis-body').waitFor({ state: 'visible', timeout: 60_000 })
  await browserPage.getByRole('tab', { name: '赛程列表' }).click()
  await browserPage.locator('.schedule-shell').waitFor({ state: 'visible', timeout: 60_000 })
  const browserMetrics = await browserPage.locator('.tab-content').evaluate(element => {
    const eventContext = document.querySelector('.mobile-event-context')
    element.scrollTop = 0
    const before = element.scrollTop
    element.scrollTop = Math.min(180, Math.max(0, element.scrollHeight - element.clientHeight))
    return {
      embeddedClass: document.documentElement.classList.contains('is-embedded-webview'),
      before,
      after: element.scrollTop,
      scrollable: element.scrollHeight > element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
      eventTop: eventContext.getBoundingClientRect().top,
      eventPaddingTop: getComputedStyle(eventContext).paddingTop
    }
  })
  if (browserMetrics.embeddedClass || browserMetrics.overflowY !== 'auto') {
    throw new Error(`普通浏览器错误进入 WebView 模式: ${JSON.stringify(browserMetrics)}`)
  }
  if (browserMetrics.scrollable && browserMetrics.after <= browserMetrics.before) {
    throw new Error(`普通浏览器内层滚动回归: ${JSON.stringify(browserMetrics)}`)
  }
  if (Math.abs(browserMetrics.eventTop) > 1 || browserMetrics.eventPaddingTop !== '7px') {
    throw new Error(`普通浏览器顶部布局回归: ${JSON.stringify(browserMetrics)}`)
  }

  const responsiveMetrics = []
  for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
    const responsivePage = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (Linux; Android 14; OWCS App Build/1; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0 Mobile Safari/537.36'
    })
    await responsivePage.goto(`${baseUrl}#/visualize`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await responsivePage.locator('.vis-body').waitFor({ state: 'visible', timeout: 60_000 })
    await responsivePage.getByRole('tab', { name: '赛程列表' }).evaluate(element => element.click())
    await responsivePage.locator('.schedule-shell').waitFor({ state: 'visible', timeout: 60_000 })
    await responsivePage.waitForTimeout(300)
    const responsiveCdp = await responsivePage.context().newCDPSession(responsivePage)
    const touchStartY = viewport.height - 55
    await responsiveCdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.floor(viewport.width / 2), y: touchStartY }]
    })
    for (const offset of [35, 70, 105, 140, 175]) {
      await responsiveCdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.floor(viewport.width / 2), y: touchStartY - offset }]
      })
      await responsivePage.waitForTimeout(16)
    }
    await responsiveCdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    })
    await responsivePage.waitForTimeout(200)
    const responsiveMetric = await responsivePage.evaluate(() => {
      const eventContext = document.querySelector('.mobile-event-context')
      const tabsContext = document.querySelector('.vis-tabs-container')
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        documentScrollTop: document.scrollingElement.scrollTop,
        documentScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight,
        eventTop: eventContext.getBoundingClientRect().top,
        tabsTop: tabsContext.getBoundingClientRect().top,
        eventPaddingTop: getComputedStyle(eventContext).paddingTop,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scheduleLeft: document.querySelector('.schedule-shell').getBoundingClientRect().left,
        scheduleRight: document.querySelector('.schedule-shell').getBoundingClientRect().right
      }
    })
    responsiveMetrics.push(responsiveMetric)
    await responsivePage.close()
  }
  if (responsiveMetrics.some(metric => (metric.documentScrollable && metric.documentScrollTop <= 0) || Math.abs(metric.eventTop) > 1 || Math.abs(metric.tabsTop - 66) > 1 || metric.eventPaddingTop !== '7px' || metric.horizontalOverflow || Math.abs(metric.scheduleLeft) > 1 || Math.abs(metric.scheduleRight - metric.width) > 1)) {
    throw new Error(`WebView responsive layout regression: ${JSON.stringify(responsiveMetrics)}`)
  }

  console.log(`[embedded-webview] passed ${JSON.stringify({ webView: metrics, browser: browserMetrics, responsive: responsiveMetrics })}`)
} finally {
  await browser.close()
}
