
function registerCharts({
  ui,
  local,
  WebContentsView,
  session,
  shell,
  deadline
}) {
  const BASE = 'https://hypeddit.com'
  const CHART_HOME = `${BASE}/music`

  const charts = new Map([['All', CHART_HOME]])

  const chartSession = session.fromPartition('chart-preview')

  chartSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false)
  )
  chartSession.setPermissionCheckHandler(() => false)
  chartSession.on('will-download', event => event.preventDefault())

  let viewer = null
  let chartRevision = 0
  let storedBounds = null
  let closed = false

  let genreCache = null
  let genreRequest = null

  function chartURL(value) {
    try {
      const url = new URL(value, BASE)

      if (
        url.origin !== BASE ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) return ''

      if (
        !/^\/(?:music|charts(?:\/(?:streams|downloads))?)(?:\/genre\/[a-z0-9-]+)?\/?$/i
          .test(url.pathname)
      ) return ''

      return url.href
    } catch {
      return ''
    }
  }

  function chartNotice(message) {
    if (!closed && !ui.isDestroyed()) {
      ui.webContents.send('chartNotice', message)
    }
  }

  function dispose(current) {
    if (!current) return

    if (viewer === current) viewer = null

    current.cancel()
    current.view.setVisible(false)

    if (!closed && !ui.isDestroyed()) {
      ui.contentView.removeChildView(current.view)
    }

    if (!current.view.webContents.isDestroyed()) {
      current.view.webContents.close({
        waitForBeforeUnload: false
      })
    }
  }

  function updateBounds() {
    if (
      !viewer ||
      viewer.view.webContents.isDestroyed()
    ) return

    const view = viewer.view
    view.setVisible(false)

    if (!storedBounds || closed || ui.isDestroyed()) return

    const factor = ui.webContents.getZoomFactor?.() ?? 1
    const zoom =
      Number.isFinite(factor) && factor > 0 ? factor : 1

    const [width, height] = ui.getContentSize()

    const clamp = (value, max) =>
      Math.round(Math.max(0, Math.min(max, value)))

    const x = clamp(storedBounds.x * zoom, width)
    const y = clamp(storedBounds.y * zoom, height)

    const right = clamp(
      (storedBounds.x + storedBounds.width) * zoom,
      width
    )

    const bottom = clamp(
      (storedBounds.y + storedBounds.height) * zoom,
      height
    )

    if (right <= x || bottom <= y) return

    view.setBounds({
      x,
      y,
      width: right - x,
      height: bottom - y
    })

    view.setVisible(viewer.ready)
  }

  local('setChartBounds', bounds => {
    storedBounds =
      bounds &&
      typeof bounds === 'object' &&
      ['x', 'y', 'width', 'height'].every(
        key =>
          typeof bounds[key] === 'number' &&
          Number.isFinite(bounds[key])
      ) &&
      bounds.width > 0 &&
      bounds.height > 0
        ? {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
          }
        : null

    updateBounds()
  })

  local('cancelChart', () => {
    chartRevision++
    storedBounds = null
    dispose(viewer)
  })

  ui.once('closed', () => {
    closed = true
    chartRevision++
    storedBounds = null
    dispose(viewer)
  })

  local('chartBack', () => {
    const wc = viewer?.view.webContents

    if (
      wc &&
      !wc.isDestroyed() &&
      wc.navigationHistory.canGoBack()
    ) {
      wc.navigationHistory.goBack()
    }
  })

  // Extract genre options from Hypeddit's live dropdown.
  // Uses a separate hidden WebContentsView so the visible chart
  // remains untouched.
  async function getChartGenres() {
    if (genreCache?.length) return genreCache
    if (genreRequest) return genreRequest

    genreRequest = (async () => {
      if (closed || ui.isDestroyed()) {
        throw new Error('Chart window closed')
      }

      const view = new WebContentsView({
        webPreferences: {
          session: chartSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          autoplayPolicy: 'user-gesture-required'
        }
      })

      const wc = view.webContents

      view.setVisible(false)

      // Hidden view remains detached from the visible layout.
      wc.setWindowOpenHandler(() => ({ action: 'deny' }))

      wc.on('will-navigate', (event, url) => {
        if (chartURL(url)) return
        event.preventDefault()
      })

      wc.on('will-redirect', (event, url) => {
        if (chartURL(url)) return
        event.preventDefault()
      })

      try {
        await deadline(wc.loadURL(CHART_HOME), 15000)

        if (closed || ui.isDestroyed() || wc.isDestroyed()) {
          throw new Error('Chart window closed')
        }

        const raw = await deadline(
          wc.executeJavaScript(`
            (async () => {
              const sleep = ms =>
                new Promise(resolve => setTimeout(resolve, ms))

              function collect() {
                const results = []
                const seen = new Set()

                function add(label, value) {
                  label = String(label || '').trim()
                  value = String(value || '').trim()

                  if (!label || !value) return
                  if (seen.has(value)) return

                  seen.add(value)
                  results.push({ label, value })
                }

                // Native select elements.
                // Prioritise controls identified as genre selectors.
                const selects = [...document.querySelectorAll(
                  'select'
                )]

                const genreSelects = selects.filter(select => {
                  const context = [
                    select.id,
                    select.name,
                    select.className,
                    select.getAttribute('aria-label'),
                    select.closest('label')?.textContent,
                    select.parentElement?.textContent?.slice(0, 120)
                  ].join(' ').toLowerCase()

                  return context.includes('genre')
                })

                const targets = genreSelects.length
                  ? genreSelects
                  : selects.length === 1
                    ? selects
                    : []

                for (const select of targets) {
                  for (const option of select.options) {
                    if (option.disabled) continue

                    const label = option.textContent.trim()
                    const value =
                      option.dataset.url ||
                      option.dataset.href ||
                      option.value

                    add(label, value)
                  }
                }

                // Custom dropdowns may expose genre links instead.
                // Only collect links associated with Hypeddit's
                // music or chart genre routes.
                for (const anchor of document.querySelectorAll(
                  'a[href*="/genre/"]'
                )) {
                  const label = anchor.textContent.trim()
                  const href = anchor.getAttribute('href')

                  add(label, href)
                }

                // Some custom select components expose option
                // values through data attributes.
                const customOptions = document.querySelectorAll(
                  '[role="option"][data-value], ' +
                  '[role="option"][data-url], ' +
                  '[data-genre][data-url]'
                )

                for (const option of customOptions) {
                  add(
                    option.textContent,
                    option.dataset.url ||
                    option.dataset.value
                  )
                }

                return results
              }

              // Allow asynchronously rendered dropdowns to populate.
              let results = []

              for (let attempt = 0; attempt < 20; attempt++) {
                results = collect()

                if (results.length > 1) break

                await sleep(250)
              }

              return results
            })()
          `),
          10000
        )

        if (!Array.isArray(raw)) {
          throw new Error('Invalid Hypeddit genre response')
        }

        const options = []
        const used = new Set()

        function resolveGenreURL(value, label) {
          const rawValue = String(value || '').trim()
          const rawLabel = String(label || '').trim()

          if (!rawValue || !rawLabel) return ''

          if (
            rawLabel.toLowerCase() === 'all' ||
            rawValue.toLowerCase() === 'all'
          ) {
            return CHART_HOME
          }

          // Direct links supplied by Hypeddit.
          if (
            rawValue.startsWith('/') ||
            /^https?:\/\//i.test(rawValue)
          ) {
            const resolved = chartURL(rawValue)

            return resolved?.includes('/genre/')
              ? resolved
              : ''
          }

          // Hypeddit genre slugs are used directly.
          // Do not generate slugs from display labels.
          if (/^[a-z0-9-]+$/i.test(rawValue)) {
            return chartURL(
              `${BASE}/music/genre/${rawValue.toLowerCase()}`
            )
          }

          return ''
        }

        for (const item of raw) {
          if (
            !item ||
            typeof item.label !== 'string' ||
            typeof item.value !== 'string'
          ) continue

          const label = item.label.trim()
          const url = resolveGenreURL(item.value, label)

          if (!label || !url || used.has(label)) continue

          used.add(label)

          options.push({
            label,
            value: label,
            url
          })
        }

        if (!options.some(item => item.label === 'All')) {
          options.unshift({
            label: 'All',
            value: 'All',
            url: CHART_HOME
          })
        }

        // Do not silently treat an empty extraction as a valid
        // one-genre dropdown.
        if (options.length <= 1) {
          throw new Error(
            'Could not extract Hypeddit genre options'
          )
        }

        if (closed || ui.isDestroyed()) {
          throw new Error('Chart window closed')
        }

        // Replace the chart lookup with the current Hypeddit list.
        charts.clear()

        for (const item of options) {
          charts.set(item.value, item.url)
        }

        genreCache = options.map(({ label, value }) => ({
          label,
          value
        }))

        return genreCache
      } finally {
        if (!wc.isDestroyed()) {
          wc.close({ waitForBeforeUnload: false })
        }
      }
    })()

    try {
      return await genreRequest
    } finally {
      genreRequest = null
    }
  }

  // Renderer-facing genre API.
  local('getChartGenres', getChartGenres)

  // Keep the existing charts API available.
  local('charts', async () => {
    const options = await getChartGenres()
    return options.map(item => item.value)
  })

  local('openChartExternal', async genre => {
    if (!charts.has(genre)) {
      await getChartGenres()
    }

    const url = charts.get(genre)

    if (!url) throw Error('Chart unavailable.')

    return shell.openExternal(url)
  })

  local('openChart', async genre => {
    if (!charts.has(genre)) {
      await getChartGenres()
    }

    if (!charts.has(genre)) {
      throw Error('Chart unavailable.')
    }

    const revision = ++chartRevision

    dispose(viewer)

    if (closed || ui.isDestroyed()) {
      return {
        status: 'cancelled',
        checkedAt: Date.now()
      }
    }

    const view = new WebContentsView({
      webPreferences: {
        session: chartSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        autoplayPolicy: 'user-gesture-required'
      }
    })

    const wc = view.webContents

    let cancel
    let fail
    let http

    const cancelled = new Promise(resolve => {
      cancel = () => resolve('cancelled')
    })

    const failed = new Promise(resolve => {
      fail = () => resolve('unavailable')
    })

    const current = {
      view,
      ready: false,
      cancel
    }

    viewer = current

    view.setVisible(false)
    ui.contentView.addChildView(view)
    updateBounds()

    const active = () =>
      revision === chartRevision &&
      viewer === current &&
      !wc.isDestroyed() &&
      !closed

    const restrict = (event, target) => {
      if (
        chartURL(
          typeof target === 'string'
            ? target
            : event.url
        )
      ) return

      event.preventDefault()

      if (active()) {
        chartNotice(
          'Use Open chart in browser for sign-in and pages outside the chart viewer.'
        )
      }
    }

    wc.on('will-navigate', restrict)
    wc.on('will-redirect', restrict)

    wc.setWindowOpenHandler(() => ({
      action: 'deny'
    }))

    const committed = (_event, _url, code) => {
      http = code

      if (code >= 400 && active()) {
        fail()

        if (current.ready) {
          chartNotice(
            'The chart page could not load. Use Open chart in browser or browse recommendations below.'
          )
          dispose(current)
        }
      }
    }

    wc.on('did-navigate', committed)

    wc.on(
      'did-fail-load',
      (_event, code, _description, _url, mainFrame) => {
        if (
          mainFrame &&
          code !== -3 &&
          active()
        ) {
          fail()

          chartNotice(
            'The chart page could not load. Use Open chart in browser or browse recommendations below.'
          )

          if (current.ready) {
            dispose(current)
          }
        }
      }
    )

    wc.once('destroyed', () => {
      cancel()

      if (viewer === current) {
        dispose(current)
      }
    })

    try {
      // loadURL resolves at did-finish-load. An early dom-ready
      // must not hide HTTP errors or a later loadURL rejection.
      const loaded = Promise.resolve(
        wc.loadURL(charts.get(genre))
      ).then(() =>
        http >= 400 ? 'unavailable' : 'ready'
      )

      const result = await deadline(
        Promise.race([loaded, failed, cancelled]),
        15000
      )

      if (!active()) {
        return {
          status: 'cancelled',
          checkedAt: Date.now()
        }
      }

      if (result !== 'ready') {
        dispose(current)

        return {
          status: 'unavailable',
          checkedAt: Date.now()
        }
      }

      current.ready = true
      updateBounds()

      return {
        status: 'ready',
        checkedAt: Date.now()
      }
    } catch {
      if (!active()) {
        return {
          status: 'cancelled',
          checkedAt: Date.now()
        }
      }

      dispose(current)

      return {
        status: 'unavailable',
        checkedAt: Date.now()
      }
    }
  })
}

module.exports = registerCharts
