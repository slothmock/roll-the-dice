
function initializeCharts({ el, action, dice, trackRow }) {
  const main = el('appMain')
  const genre = el('chartGenre')
  const status = el('chartStatus')
  const reload = el('openChart')

  let chartRequest = 0
  let wasActive = false
  let viewEnabled = false
  let boundsKey
  let framePending = false
  let genresLoaded = false
  let genresRequest = null

  const active = () => main.dataset.page === 'charts'

  function loading(message = '') {
    const viewport = el('chartViewport')
    viewport.ariaBusy = String(Boolean(message))
    if (message) viewport.dataset.loading = message
    else delete viewport.dataset.loading
  }

  const fallback = () => {
    loading()
    el('chartAlternatives').hidden = false
    el('chartAlternatives').open = true
    status.textContent =
      'The in-app Hypeddit chart could not load. Open it in your browser or browse recommendations below.'
  }

  // Populate the genre dropdown using Hypeddit's own chart genres.
  // The main process supplies live Hypeddit options through the preload bridge.
  async function populateGenres() {
    if (genresLoaded) return
    if (genresRequest) return genresRequest

    const previous = genre.value

    genresRequest = (async () => {
      const options = await dice.getChartGenres()

      if (!Array.isArray(options)) {
        throw new Error('Invalid Hypeddit genre response')
      }

      const valid = []
      const seen = new Set()

      for (const item of options) {
        if (
          typeof item?.label !== 'string' ||
          typeof item?.value !== 'string'
        ) continue

        const label = item.label.trim()
        const value = item.value.trim()

        if (!label || !value || seen.has(value)) continue

        seen.add(value)
        valid.push({ label, value })
      }

      if (!valid.length) {
        throw new Error('No Hypeddit chart genres available')
      }

      genre.replaceChildren(
        ...valid.map(({ label, value }) =>
          new Option(label, value)
        )
      )

      if (seen.has(previous)) {
        genre.value = previous
      } else if (seen.has('Drum & Bass')) {
        genre.value = 'Drum & Bass'
      } else if (seen.has('All')) {
        genre.value = 'All'
      } else {
        genre.selectedIndex = 0
      }

      genresLoaded = true
    })()

    try {
      await genresRequest
    } finally {
      genresRequest = null
    }
  }

  function bounds() {
    if (
      !active() ||
      !viewEnabled ||
      document.querySelector(
        'dialog[open], [popover]:popover-open'
      )
    ) return null

    const rect = el('chartViewport').getBoundingClientRect()

    if (
      ![
        rect.left,
        rect.top,
        rect.right,
        rect.bottom,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight
      ].every(Number.isFinite)
    ) return null

    const x = Math.max(0, rect.left)
    const y = Math.max(0, rect.top)
    const width = Math.min(window.innerWidth, rect.right) - x
    const height = Math.min(window.innerHeight, rect.bottom) - y

    return (
      width > 0 &&
      height > 0 &&
      rect.width > 0 &&
      rect.height > 0
    )
      ? { x, y, width, height }
      : null
  }

  async function syncBounds() {
    const rect = bounds()
    const key = JSON.stringify(rect)

    if (key === boundsKey) return

    boundsKey = key

    try {
      await dice.setChartBounds(rect)
    } catch (error) {
      if (boundsKey === key) boundsKey = undefined
      throw error
    }
  }

  function scheduleBounds() {
    if (framePending) return

    framePending = true

    requestAnimationFrame(() => {
      framePending = false
      const request = chartRequest

      syncBounds().catch(() => {
        if (request === chartRequest && active()) fallback()
      })
    })
  }

  window.addEventListener('resize', scheduleBounds)
  window.addEventListener('scroll', scheduleBounds, true)

  // Native child views sit above DOM overlays.
  document.addEventListener('toggle', scheduleBounds, true)
  document.addEventListener('close', scheduleBounds, true)

  new MutationObserver(scheduleBounds).observe(
    document.body,
    {
      subtree: true,
      attributes: true,
      attributeFilter: ['open']
    }
  )

  const resizeObserver = new ResizeObserver(scheduleBounds)

  for (const target of [
    el('chartViewport'),
    status,
    main,
    document.body
  ]) {
    resizeObserver.observe(target)
  }

  async function loadChart() {
    if (!active()) return

    const request = ++chartRequest

    viewEnabled = false
    boundsKey = undefined
    reload.disabled = true
    genre.disabled = true

    status.textContent = genresLoaded
      ? 'Loading the Hypeddit chart…'
      : 'Loading Hypeddit genres…'
    loading(status.textContent)

    try {
      await dice.cancelChart()

      if (request !== chartRequest || !active()) return

      await populateGenres()

      if (request !== chartRequest || !active()) return

      const selectedGenre = genre.value

      if (!selectedGenre) {
        throw new Error('No Hypeddit genre selected')
      }

      status.textContent = 'Loading the Hypeddit chart…'
      loading(status.textContent)

      viewEnabled = true
      await syncBounds()

      if (request !== chartRequest || !active()) return

      const {
        status: result,
        checkedAt
      } = await dice.openChart(selectedGenre)

      if (request !== chartRequest || !active()) return

      if (result === 'cancelled') {
        status.textContent = ''
        return
      }

      el('chartAlternatives').hidden = false
      el('chartAlternatives').open = result !== 'ready'

      if (result === 'ready') {
        status.textContent =
          'Chart loaded · Checked ' +
          new Date(checkedAt).toLocaleTimeString()
      } else {
        fallback()
      }
    } catch (error) {
      if (request === chartRequest && active()) {
        fallback()
      }
    } finally {
      if (request === chartRequest) {
        loading()
        reload.disabled = false
        genre.disabled = false
      }
    }
  }

  function pageChanged() {
    const nowActive = active()

    if (nowActive === wasActive) return

    wasActive = nowActive

    if (nowActive) {
      loadChart()
      return
    }

    chartRequest++
    viewEnabled = false
    loading()
    reload.disabled = false
    genre.disabled = false
    status.textContent = ''

    syncBounds().catch(() => {})
    dice.cancelChart().catch(() => {})

    boundsKey = undefined
  }

  new MutationObserver(pageChanged).observe(
    main,
    {
      attributes: true,
      attributeFilter: ['data-page']
    }
  )

  genre.onchange = () => {
    if (active()) return loadChart()

    chartRequest++
    reload.disabled = false
    status.textContent = ''
  }

  dice.onChartNotice(message => {
    if (!active()) return

    status.textContent = message
    el('chartAlternatives').hidden = false
  })

  reload.onclick = loadChart

  el('chartBack').onclick = async () => {
    if (!active()) return

    const request = chartRequest

    try {
      await dice.chartBack()

      if (request === chartRequest) scheduleBounds()
    } catch (error) {
      if (request === chartRequest && active()) fallback()
    }
  }

  pageChanged()

  el('openChartExternal').onclick = action(() =>
    dice.openChartExternal(genre.value)
  )

  el('showRecommendations').onclick = action(async () => {
    const control = el('showRecommendations')
    const recommendationStatus = el('recommendationStatus')

    control.disabled = true
    recommendationStatus.textContent =
      'Checking verified tracks…'

    try {
      const {
        rows,
        status: result
      } = await dice.recommendations()

      if (result === 'cancelled') {
        recommendationStatus.textContent =
          'Discovery genre changed. Try again.'
        return
      }

      el('recommendationList').replaceChildren(
        ...rows.map(track =>
          trackRow(
            track,
            () => dice.listenTrack(track.url),
            { artwork: true }
          )
        )
      )

      recommendationStatus.textContent = rows.length
        ? ''
        : 'No verified recommendations are ready. Try again.'
    } finally {
      control.disabled = false
    }
  })
}
