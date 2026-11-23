
const genreFamilies = [
  ['Drum & Bass', [
    ['Drum & Bass', 'Drum & Bass', 'drum and bass', 'dnb'],
    ['DnB Rollers', 'Rollers', 'dnb rollers', 'rolling dnb', 'rollers'],
    ['Jump Up', 'Jump Up', 'jump up dnb', 'jump up', 'jumpup'],
    ['Liquid DnB', 'Liquid', 'liquid dnb', 'liquid drum and bass', 'liquid funk'],
    ['Dancefloor DnB', 'Dancefloor', 'dancefloor dnb', 'dancefloor drum and bass'],
    ['Neurofunk', 'Neurofunk', 'neurofunk', 'neuro dnb'],
    ['Minimal DnB', 'Minimal', 'minimal dnb', 'deep dnb'],
    ['Dark DnB', 'Dark', 'dark dnb', 'techstep'],
    ['Atmospheric DnB', 'Atmospheric', 'atmospheric dnb', 'intelligent dnb'],
    ['Jungle', 'Jungle', 'jungle breakbeat', 'jungle dnb', 'jungle music'],
    ['Ragga Jungle', 'Ragga Jungle', 'ragga jungle']
  ]],

  ['UK Garage', [
    ['UK Garage', 'UK Garage', 'uk garage', 'ukg'],
    ['2-Step', '2-Step', '2 step garage', '2step', '2-step garage'],
    ['4x4 Garage', '4x4 Garage', '4x4 garage', '4x4 ukg'],
    ['Speed Garage', 'Speed Garage', 'speed garage', 'speedgarage'],
    ['Bassline', 'Bassline', 'uk bassline', 'bassline house'],
    ['UK Bass', 'UK Bass', 'uk bass', 'uk bass music'],
    ['UK Funky', 'UK Funky', 'uk funky'],
    ['Future Garage', 'Future Garage', 'future garage']
  ]],

  ['House', [
    ['House', 'House', 'house music'],
    ['Tech House', 'Tech House', 'tech house', 'techhouse'],
    ['Deep House', 'Deep House', 'deep house', 'deephouse'],
    ['Minimal / Deep Tech', 'Minimal / Deep Tech', 'minimal deep tech', 'deep tech house', 'minimal house'],
    ['Bass House', 'Bass House', 'bass house', 'basshouse'],
    ['Funky House', 'Funky House', 'funky house', 'disco house'],
    ['Garage House', 'Garage House', 'garage house'],
    ['Progressive House', 'Progressive House', 'progressive house'],
    ['Afro House', 'Afro House', 'afro house']
  ]],

  ['Techno', [
    ['Techno', 'Techno', 'techno'],
    ['Hard Techno', 'Hard Techno', 'hard techno', 'hardtechno'],
    ['Hardgroove', 'Hardgroove', 'hardgroove', 'hard groove techno'],
    ['Hypnotic Techno', 'Hypnotic', 'hypnotic techno'],
    ['Industrial Techno', 'Industrial', 'industrial techno'],
    ['Raw Techno', 'Raw', 'raw techno'],
    ['Melodic Techno', 'Melodic', 'melodic techno']
  ]],

  ['Dubstep / 140', [
    ['Dubstep', 'Dubstep', 'dubstep', '140 dubstep'],
    ['Deep Dubstep / 140', 'Deep Dubstep / 140', 'deep dubstep', 'deep 140', 'deep dub'],
    ['UK Dubstep', 'UK Dubstep', 'uk dubstep', 'original dubstep'],
    ['140', '140', '140 bpm', '140 bass'],
    ['Riddim', 'Riddim', 'riddim dubstep'],
    ['Grime', 'Grime', 'grime instrumental', 'grime beats']
  ]],

  ['Breaks / Electro', [
    ['Breakbeat', 'Breakbeat', 'breakbeat', 'breaks'],
    ['UK Breaks', 'UK Breaks', 'uk breaks', 'uk breakbeat'],
    ['Nu Skool Breaks', 'Nu Skool', 'nu skool breaks'],
    ['Electro', 'Electro', 'electro breaks'],
    ['Leftfield Bass', 'Leftfield Bass', 'leftfield bass', 'experimental bass']
  ]],

  ['Trance / Hard Dance', [
    ['Trance', 'Trance', 'trance', 'trance music'],
    ['Progressive Trance', 'Progressive', 'progressive trance'],
    ['Hard Trance', 'Hard Trance', 'hard trance'],
    ['Psytrance', 'Psytrance', 'psytrance', 'psy trance'],
    ['Hard Dance / Hardstyle', 'Hard Dance / Hardstyle', 'hardstyle', 'hard dance'],
    ['UK Hardcore', 'UK Hardcore', 'uk hardcore', 'happy hardcore'],
    ['Gabber', 'Gabber', 'gabber', 'hardcore techno'],
    ['Donk', 'Donk', 'donk', 'scouse house']
  ]]
]

const genres = Object.fromEntries(
  genreFamilies.flatMap(([, options]) =>
    options.map(([id, , ...terms]) => [id, [...new Set(terms)]])
  )
)

const genreMenu = genreFamilies.map(([label, options]) => ({
  label,
  options: options.map(([id, label]) => ({ id, label }))
}))

const genreAliases = {
  '140 / Dubstep': 'Dubstep',
  'UK Garage / 2-Step': 'UK Garage',
  'Hardstyle': 'Hard Dance / Hardstyle',
  'Hard Dance': 'Hard Dance / Hardstyle'
}

function visibleGenre(genre) {
  const id = genreAliases[genre] || genre
  return Object.hasOwn(genres, id) ? id : ''
}

function visibleGenres(list) {
  return Array.isArray(list)
    ? [...new Set(list.map(visibleGenre).filter(Boolean))]
    : []
}

// Weighted random selection with a configurable exploration rate.
function weightedChoice(
  choices,
  score,
  random = Math.random,
  wildcard = 0.2
) {
  if (!choices.length) return undefined

  const exploration = Math.max(0, Math.min(1, wildcard))

  if (random() < exploration) {
    return choices[Math.floor(random() * choices.length)]
  }

  const weights = choices.map(item => {
    const value = Number(score(item))
    const safe = Number.isFinite(value) ? value : 0

    return 2 ** Math.max(-3, Math.min(3, safe))
  })

  let draw = random() * weights.reduce(
    (sum, value) => sum + value,
    0
  )

  for (let i = 0; i < choices.length; i++) {
    draw -= weights[i]
    if (draw < 0) return choices[i]
  }

  return choices[choices.length - 1]
}

// Neutral-prior smoothing prevents sparse feedback from dominating.
function smoothedAverage(values, prior = 1) {
  if (!values.length) return 0

  return values.reduce((sum, value) => sum + value, 0) /
    (prior + values.length)
}

// Retain the existing helper name for internal compatibility.
function average(values) {
  return smoothedAverage(values)
}

function normalise(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// Canonicalise track URLs for consistent history and ratings.
const blockedPaths = new Set([
  'discover',
  'search',
  'charts',
  'genres',
  'tags',
  'you',
  'pages',
  'stations',
  'settings',
  'stream',
  'upload',
  'notifications',
  'messages',
  'likes',
  'sets',
  'albums',
  'tracks',
  'reposts',
  'popular-tracks'
])

function canonicalTrackUrl(value) {
  try {
    const url = new URL(value)

    if (
      url.protocol !== 'https:' &&
      url.protocol !== 'http:'
    ) return null

    if (
      url.hostname !== 'soundcloud.com' &&
      url.hostname !== 'www.soundcloud.com'
    ) return null

    const parts = url.pathname.split('/').filter(Boolean)

    if (parts.length !== 2) return null

    if (blockedPaths.has(parts[0].toLowerCase())) {
      return null
    }

    if (!parts.every(part => /^[\w-]+$/.test(part))) {
      return null
    }

    return `https://soundcloud.com/${parts.join('/')}`
  } catch {
    return null
  }
}

function canonicalProfileUrl(value) {
  try {
    const url = new URL(value)

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname)
    ) return null

    const parts = url.pathname.split('/').filter(Boolean)

    if (
      parts.length !== 1 ||
      !/^[\w-]+$/.test(parts[0]) ||
      blockedPaths.has(parts[0].toLowerCase())
    ) return null

    return `https://soundcloud.com/${parts[0].toLowerCase()}`
  } catch {
    return null
  }
}

// Patterns run against normalised, space-separated text.
const stylePatterns = {
  'drum and bass': /\b(?:drum and bass|drum n bass|dnb)\b/,
  'rollers': /\b(?:roller|rollers|rolling dnb)\b/,
  'jump up': /\b(?:jump up|jumpup)\b/,
  'liquid': /\b(?:liquid|liquid funk)\b/,
  'dancefloor': /\bdancefloor\b/,
  'neurofunk': /\b(?:neurofunk|neuro dnb)\b/,
  'minimal dnb': /\b(?:minimal dnb|deep dnb)\b/,
  'dark dnb': /\b(?:dark dnb|darkstep|techstep)\b/,
  'atmospheric dnb': /\b(?:atmospheric dnb|intelligent dnb)\b/,
  'jungle': /\bjungle\b/,
  'ragga jungle': /\bragga jungle\b/,

  'uk garage': /\b(?:uk garage|ukg)\b/,
  '2 step': /\b(?:2 step|2step)\b/,
  '4x4 garage': /\b(?:4x4 garage|4x4 ukg)\b/,
  'speed garage': /\b(?:speed garage|speedgarage)\b/,
  'bassline': /\bbassline\b/,
  'uk bass': /\buk bass\b/,
  'uk funky': /\buk funky\b/,
  'future garage': /\bfuture garage\b/,

  'house': /\bhouse\b/,
  'tech house': /\b(?:tech house|techhouse)\b/,
  'deep house': /\b(?:deep house|deephouse)\b/,
  'minimal deep tech': /\b(?:minimal deep tech|deep tech house|minimal house)\b/,
  'bass house': /\b(?:bass house|basshouse)\b/,
  'funky house': /\b(?:funky house|disco house)\b/,
  'garage house': /\bgarage house\b/,
  'progressive house': /\bprogressive house\b/,
  'afro house': /\b(?:afro house|afrohouse)\b/,

  'techno': /\btechno\b/,
  'hard techno': /\b(?:hard techno|hardtechno)\b/,
  'hardgroove': /\b(?:hardgroove|hard groove)\b/,
  'hypnotic techno': /\bhypnotic techno\b/,
  'industrial techno': /\bindustrial techno\b/,
  'raw techno': /\braw techno\b/,
  'melodic techno': /\bmelodic techno\b/,

  'dubstep': /\bdubstep\b/,
  'deep dubstep': /\b(?:deep dubstep|deep 140)\b/,
  '140': /\b140(?: bpm| bass| dubstep)?\b/,
  'riddim': /\briddim\b/,
  'grime': /\bgrime\b/,

  'breakbeat': /\b(?:breakbeat|breaks)\b/,
  'electro': /\belectro\b/,
  'leftfield bass': /\bleftfield bass\b/,

  'trance': /\btrance\b/,
  'psytrance': /\b(?:psytrance|psy trance)\b/,
  'hardstyle': /\bhardstyle\b/,
  'hard dance': /\bhard dance\b/,
  'uk hardcore': /\b(?:uk hardcore|happy hardcore)\b/,
  'gabber': /\bgabber\b/,
  'donk': /\bdonk\b/,

  'vocal': /\bvocals?\b/,
  'dark': /\bdark\b/,
  'deep': /\bdeep\b/,
  'bootleg': /\bbootleg\b/,
  'remix': /\bremix\b/,
  'edit': /\bedit\b/,
  'dubplate': /\bdubplate\b/,
  'dubwise': /\bdubwise\b/,
  'refix': /\brefix\b/
}

function extractTags(value = '') {
  const words = normalise(value)

  return new Set(
    Object.entries(stylePatterns)
      .filter(([, pattern]) => pattern.test(words))
      .map(([name]) => name)
  )
}

function traits(
  url,
  { title = '', styleTags = '', artist = '' } = {}
) {
  const canonical = canonicalTrackUrl(url)

  if (!canonical) {
    return {
      uploader: '',
      artist: '',
      tags: new Set()
    }
  }

  const [, uploader, slug] = new URL(canonical).pathname.split('/')

  // SoundCloud titles often credit the artist before a spaced dash.
  const titleCredit = String(title).match(
    /^(.{1,80}?)\s+[-–—]\s+\S/u
  )?.[1]

  const credit = normalise(artist || titleCredit || '')

  // Search metadata and track identifiers for style signals.
  const tags = extractTags(
    [slug, title, styleTags].join(' ')
  )

  return {
    uploader: uploader.toLowerCase(),
    artist: credit,
    tags
  }
}

function pickTerm(
  terms,
  ratings,
  random = Math.random,
  wildcard = 0.2
) {
  return weightedChoice(
    terms,
    term => smoothedAverage(
      Object.values(ratings)
        .filter(entry =>
          entry &&
          entry.term === term &&
          Number.isFinite(Number(entry.stars))
        )
        .map(entry => Number(entry.stars) - 3)
    ),
    random,
    wildcard
  )
}

function pick(
  links,
  seen,
  ratings = {},
  random = Math.random,
  wildcard = 0.2,
  artists = [],
  metadata = new Map(),
  profiles = []
) {
  // Remove duplicates, invalid links and previously seen tracks.
  const seenUrls = new Set(
    seen.map(canonicalTrackUrl).filter(Boolean)
  )

  const candidates = new Map()

  for (const link of links) {
    const canonical = canonicalTrackUrl(link)

    if (!canonical || seenUrls.has(canonical)) {
      continue
    }

    // Preserve the original link while deduplicating by canonical URL.
    if (!candidates.has(canonical)) {
      candidates.set(canonical, link)
    }
  }

  const choices = [...candidates.keys()]

  if (!choices.length) return undefined

  // Aggregate feedback from valid, rated tracks.
  const feedback = Object.entries(ratings)
    .filter(([, entry]) =>
      entry &&
      Number.isFinite(Number(entry.stars))
    )
    .map(([url, entry]) => {
      const canonical = canonicalTrackUrl(url)

      if (!canonical) return null

      const info = traits(canonical, entry)

      return {
        ...info,
        value: Number(entry.stars) - 3
      }
    })
    .filter(Boolean)

  const favourites = artists
    .map(normalise)
    .filter(Boolean)

  const favouriteProfiles = new Set(
    profiles.map(canonicalProfileUrl).filter(Boolean)
  )

  // Resolve metadata regardless of URL query parameters or format.
  const metadataByUrl = new Map()

  for (const [url, data] of metadata) {
    const canonical = canonicalTrackUrl(url)

    if (canonical) {
      metadataByUrl.set(canonical, data)
    }
  }

  const selected = weightedChoice(
    choices,
    url => {
      const {
        uploader,
        artist,
        tags
      } = traits(url, metadataByUrl.get(url))

      const credited = []
      const account = []
      const style = []

      const words = ' ' + normalise(
        new URL(url).pathname
      ) + ' '

      for (const entry of feedback) {
        // Prefer artist credits when both tracks have them.
        if (artist && entry.artist) {
          if (artist === entry.artist) {
            credited.push(entry.value)
          }
        } else if (
          uploader &&
          entry.uploader === uploader
        ) {
          account.push(entry.value)
        }

        // Score overlapping style characteristics.
        if (
          tags.size &&
          [...tags].some(tag => entry.tags.has(tag))
        ) {
          style.push(entry.value)
        }
      }

      // Reward recognised favourite artists.
      const seed = favourites.some(name =>
        artist
          ? artist === name
          : words.includes(' ' + name + ' ')
      )

      // Reward uploads from favourite SoundCloud profiles.
      const profileUrl =
        `https://soundcloud.com/${uploader}`

      const favourite = favouriteProfiles.has(profileUrl)

      const artistScore = 1.5 * smoothedAverage(credited)
      const accountScore = 0.75 * smoothedAverage(account)
      const styleScore = smoothedAverage(style)
      const favouriteScore = favourite ? 2 : seed ? 1.5 : 0

      return (
        artistScore +
        accountScore +
        styleScore +
        favouriteScore
      )
    },
    random,
    wildcard
  )

  // Return the original link to preserve the existing pick() contract.
  return candidates.get(selected)
}

module.exports = {
  genres,
  genreMenu,
  visibleGenre,
  visibleGenres,
  pick,
  pickTerm
}
