const styles={
  'DnB Rollers':/\brollers?\b/i, 'Jump Up':/\bjump[ -]?up\b/i,
  Jungle:/\bjungle\b/i, 'Liquid DnB':/\bliquid\b/i,
  'Dancefloor DnB':/\bdance[ -]?floor\b/i, Neurofunk:/\bneuro[ -]?funk\b/i
}
const noteNames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const minor=[5,12,7,2,9,4,11,6,1,8,3,10]
// Major wheel numbers are shifted three semitones relative to minor.
function musicalKey(text=''){
  const wheel=text.match(/\b(1[0-2]|[1-9])([AB])\b/i)
  if(wheel)return wheel[1]+wheel[2].toUpperCase()
  const m=text.replaceAll('♭','b').replaceAll('♯','#').match(/\b([A-G])([#b]?)\s*(minor|major|min|maj|m)\b/i)
  if(!m || (m[3].toLowerCase()==='m' && m[1]===m[1].toLowerCase()))return ''
  const pitch=(noteNames.indexOf(m[1].toUpperCase())+(m[2]==='#'?1:m[2]?-1:0)+12)%12
  return /^maj/i.test(m[3])?minor[(pitch+9)%12]+'B':minor[pitch]+'A'
}
const keyNotation='(?:(?:1[0-2]|[1-9])[AB]|[A-G][#♯b♭]?\\s*(?:minor|major|min|maj|m))'
const standaloneKey=new RegExp('^'+keyNotation+'$','i')
const keyLabel=new RegExp('\\b(?:musical\\s+key|key(?:\\s+signature)?)\\s*[:=–-]\\s*('+keyNotation+')\\b(?!-)','gi')

function listedTrackKey(track){
  const keys=new Set()
  const add=value=>{
    if(typeof value!=='string')return
    const notation=value.trim()
    if(standaloneKey.test(notation)){
      const key=musicalKey(notation[0].toUpperCase()+notation.slice(1))
      if(key)keys.add(key)
    }
  }
  add(track.keySignature)
  const tags=typeof track.listedTags==='string'?track.listedTags.match(/"[^"]+"|[^\s"]+/g)||[]:[]
  for(const token of tags)add(token.replace(/^"|"$/g,''))
  const description=[track.uploaderDescription,track.description].find(value=>typeof value==='string')||''
  for(const text of [track.title||'',description,...tags]){
    for(const match of text.matchAll(keyLabel))add(match[1])
  }
  for(const line of description.split(/\r?\n/)){
    add(line)
    if(/(?:\b|\d)bpm\b/i.test(line))for(const part of line.split(/[/|·•]/))add(part)
  }
  return keys.size===1?[...keys][0]:''
}
function trackURL(value){
  try{
    const u=new URL(value)
    if(u.origin!=='https://soundcloud.com'||!/^\/[\w-]+\/[\w-]+\/?$/.test(u.pathname)||/^\/(search|discover|charts|genres|tags|you|pages|stations|settings)\//.test(u.pathname))return ''
    return u.origin+u.pathname.replace(/\/$/,'')
  }catch{return ''}
}
function classify(t,style,key){
  const text=[t.title,t.styleTags,t.listedGenre,t.listedTags].filter(Boolean).join(' ')
  const published=listedTrackKey(t), styleMatch=styles[style]?.test(text) || false
  if(published && published!==key)return null
  if(!styleMatch && Object.values(styles).some(r=>r.test(text)))return null
  const exact=!!key && published===key && styleMatch
  return {...t,exact,key:published,styleMatch}
}
const dnbTerms={
  'DnB Rollers':'rollers?', 'Jump Up':'jump[ -]?up',Jungle:'jungle',
  'Liquid DnB':'liquid','Dancefloor DnB':'dance[ -]?floor',Neurofunk:'neuro[ -]?funk'
}
const dnbName='(?:d\\s*[&+]?\\s*b|dnb|drum\\s*(?:and|&)\\s*bass)'
const danceStyles={
  'UK Garage':/\b(?:uk[ -]?garage|ukg|2[ -]?step|two[ -]step)\b/i,
  'Speed Garage':/\bspeed[ -]?(?:garage|ukg)\b/i,
  Bassline:/\b(?:uk[ -]?bassline|bassline[ -](?:house|garage)|(?:4x4|4[ -]by[ -]4)[ -](?:bassline|garage))\b/i,
  House:/^(?:house(?: music)?|classic house|vocal house|funky house|jackin[’']? house)$/i,
  'Tech House':/\btech[ -]?house\b/i,
  'Deep House':/\bdeep[ -]?house\b/i,
  Techno:/^techno(?: music)?$/i,
  'Hard Techno':/\b(?:hard[ -]?techno|schranz|industrial techno)\b/i,
  Dubstep:/^(?:dubstep(?: music)?|brostep|riddim dubstep|tearout dubstep)$/i,
  'Deep Dubstep / 140':/\b(?:(?:deep|minimal|uk|140(?:\s*bpm)?)[ -]+dubstep|dubstep[ -]+(?:deep|140(?:\s*bpm)?))\b/i,
  Trance:/\b(?:trance|psytrance)\b/i,
  'Hard Dance / Hardstyle':/\b(?:hardstyle|hard[ -]?dance|rawstyle)\b/i,
  Breakbeat:/\b(?:breakbeats?|breaks|nu[ -]skool[ -]breaks)\b/i
}
const broadStyles={
  'UK Garage':['Speed Garage','Bassline'], House:['Tech House','Deep House'], Techno:['Hard Techno'],
  Dubstep:['Deep Dubstep / 140']
}
const relatedDanceStyles=[['UK Garage','Speed Garage','Bassline'],['House','Tech House','Deep House'],
  ['Techno','Hard Techno'],['Dubstep','Deep Dubstep / 140'],['Trance'],['Hard Dance / Hardstyle'],['Breakbeat']]
const dnbGenre=new RegExp('^'+dnbName+'$','i')
const dnbEvidence=new RegExp('\\b(?:'+dnbName+'|jungle)\\b','i')
const dnbNeedsFamily=new Set(['DnB Rollers','Liquid DnB','Dancefloor DnB'])
function danceGenreMatches(track,genre){
  const pattern=danceStyles[genre]
  if(!pattern)return false
  const listed=(track.listedGenre||'').trim()
  const sourceTags=(track.listedTags||'').match(/"[^"]+"|[^\s"]+/g)||[]
  const tags=sourceTags.map(tag=>tag.replace(/^"|"$/g,''))
  const titleLabels=Array.from((track.title||'').matchAll(/\[([^\]]+)\]|\(([^)]+)\)/g),
    match=>(match[1]||match[2]).trim().replace(/\s+(?:remix|edit|bootleg|mix)$/i,''))
  const labels=[listed,track.styleTags||'',...tags,...titleLabels]
  const family=relatedDanceStyles.find(items=>items.includes(genre))
  const contradictory=relatedDanceStyles.some(items=>items!==family&&items.some(style=>danceStyles[style].test(listed)))
  if(contradictory||/^(?:rock|ambient|pop|hip[ -]?hop|reggae|jungle)\b/i.test(listed)||dnbGenre.test(listed))return false
  const basslineTag=tags.some(value=>/^bassline$/i.test(value))
  if(broadStyles[genre]?.some(style=>labels.some(value=>danceStyles[style].test(value))||
    (style==='Bassline'&&basslineTag)))return false
  if(labels.some(value=>pattern.test(value)))return true
  return genre==='Bassline'&&(/^bassline$/i.test(listed)||
    (basslineTag&&labels.some(value=>danceStyles['UK Garage'].test(value))))
}
// Additional menu IDs only: the original nineteen matchers below stay untouched.
const additionalGenres={
  'Drum & Bass':['dnb',['drum and bass','drum bass','drum n bass','dnb','d b']],
  'Minimal DnB':['dnb',['minimal dnb','deep dnb','minimal drum and bass','deep drum and bass'],['minimal','deep']],
  'Dark DnB':['dnb',['dark dnb','dark drum and bass','techstep'],['dark']],
  'Atmospheric DnB':['dnb',['atmospheric dnb','intelligent dnb','atmospheric drum and bass','intelligent drum and bass'],['atmospheric','intelligent']],
  'Ragga Jungle':['dnb',['ragga jungle','raggajungle']],
  '2-Step':['garage',['2 step','2step','two step garage','two step ukg']],
  '4x4 Garage':['garage',['4x4 garage','4x4 ukg','4 by 4 garage']],
  'UK Bass':['garage',['uk bass']],
  'UK Funky':['garage',['uk funky']],
  'Future Garage':['garage',['future garage','futuregarage']],
  'Minimal / Deep Tech':['house',['minimal deep tech','deep tech house','minimal house'],['minimal','deep tech']],
  'Bass House':['house',['bass house','basshouse']],
  'Funky House':['house',['funky house','disco house']],
  'Garage House':['house',['garage house']],
  'Progressive House':['house',['progressive house','progressivehouse']],
  'Afro House':['house',['afro house','afrohouse']],
  Hardgroove:['techno',['hardgroove','hard groove techno']],
  'Hypnotic Techno':['techno',['hypnotic techno','hypnotictechno']],
  'Industrial Techno':['techno',['industrial techno','industrialtechno']],
  'Raw Techno':['techno',['raw techno','rawtechno']],
  'Melodic Techno':['techno',['melodic techno','melodictechno']],
  '140':['dubstep',['140','140 bass','140 dubstep','deep 140','deep dubstep','uk dubstep']],
  'UK Dubstep':['dubstep',['uk dubstep','ukdubstep','original dubstep']],
  Riddim:['dubstep',['riddim','riddim dubstep']],
  Grime:['dubstep',['grime','instrumental grime']],
  'UK Breaks':['breaks',['uk breaks','uk breakbeat']],
  'Nu Skool Breaks':['breaks',['nu skool breaks','new school breaks','nuskool breaks']],
  Electro:['breaks',['electro','electro funk','electrofunk','electro breaks']],
  'Leftfield Bass':['breaks',['leftfield bass','experimental bass']],
  'Progressive Trance':['trance',['progressive trance','progressivetrance']],
  'Hard Trance':['trance',['hard trance','hardtrance']],
  Psytrance:['trance',['psytrance','psy trance','psychedelic trance']],
  'UK Hardcore':['harddance',['uk hardcore','happy hardcore','ukhardcore']],
  Gabber:['harddance',['gabber','gabba','hardcore techno']],
  Donk:['harddance',['donk','scouse house']]
}
const additionalFamilies={
  dnb:['drum and bass','drum bass','drum n bass','dnb','d b','jungle','neurofunk','techstep'],
  garage:['uk garage','ukg','speed garage','bassline','2 step','2step','4x4 garage','uk bass','uk funky','future garage'],
  house:['house','techhouse','deephouse','basshouse','electro house'],
  techno:['techno','hardtechno','hardgroove','schranz'],
  dubstep:['dubstep','140','riddim','grime'],
  breaks:['breakbeat','breaks','electro','leftfield bass','experimental bass'],
  trance:['trance','psytrance'],
  harddance:['hard dance','hardstyle','rawstyle','uk hardcore','happy hardcore','gabber','donk','scouse house','hardcore techno'],
  other:['rock','pop','ambient','hip hop','hiphop','reggae','disco','electro pop','electropop','electro swing']
}
function genreLabel(value){
  if(typeof value!=='string')return ''
  let words=''
  for(const character of value.normalize('NFKC').toLowerCase()){
    words+=character>='a'&&character<='z'||character>='0'&&character<='9'?character:' '
  }
  return words.split(' ').filter(Boolean).join(' ')
}
function hasGenrePhrase(label,phrase){
  return (' '+label+' ').includes(' '+phrase+' ')
}
function additionalGenreMatches(track,genre){
  const [family,aliases,modifiers=[]]=additionalGenres[genre]
  const primary=genreLabel(track.listedGenre)
  // Prefer the most specific primary label: scouse house is hard dance,
  // disco house is house, and hardcore techno is not generic techno.
  const primaryStrength=Object.fromEntries(Object.entries(additionalFamilies).map(([group,names])=>{
    const aliases=[...names,...Object.values(additionalGenres).filter(([owner])=>owner===group).flatMap(([,values])=>values)]
    return [group,Math.max(0,...aliases.filter(alias=>hasGenrePhrase(primary,alias)).map(alias=>alias.length))]
  }))
  if(Object.entries(primaryStrength).some(([group,strength])=>group!==family&&strength>0&&strength>=primaryStrength[family]))return false
  const labels=[primary,genreLabel(track.styleTags)]
  // Keep quoted multi-word tags separate, especially the numeric genre 140.
  const tags=typeof track.listedTags==='string'?track.listedTags:''
  for(const part of tags.split('"'))labels.push(genreLabel(part))
  const title=typeof track.title==='string'?track.title:''
  for(let index=0;index<title.length;index++){
    const close=title[index]==='['?']':title[index]==='('?')':''
    if(!close)continue
    const end=title.indexOf(close,index+1)
    if(end<0)continue
    const words=genreLabel(title.slice(index+1,end)).split(' ')
    if(['remix','edit','bootleg','mix'].includes(words.at(-1)))words.pop()
    labels.push(words.join(' '))
    index=end
  }
  if(genre==='Electro'&&['electro house','electro pop','electropop','electro swing'].some(alias=>hasGenrePhrase(primary,alias)))return false
  if(aliases.some(alias=>labels.some(label=>genre==='140'&&alias.includes('140')||genre==='Electro'&&alias==='electro'?
    label===alias:hasGenrePhrase(label,alias))))return true
  return modifiers.some(modifier=>labels.some(label=>hasGenrePhrase(label,modifier)))&&
    labels.some(label=>additionalFamilies[family].some(alias=>hasGenrePhrase(label,alias)))
}
function genreMatches(track,genre){
  if(Object.hasOwn(additionalGenres,genre))return additionalGenreMatches(track,genre)
  if(styles[genre]){
    const primary=(track.listedGenre||'').trim()
    let listed=[track.listedGenre,track.listedTags,track.styleTags].filter(Boolean).join(' ')
    if(genre==='DnB Rollers')listed=listed.replace(/\bez\s+rollers\b/gi,'')
    const conflicting=/^(?:pop|rock|ambient|hip[ -]?hop|reggae|disco|house|techno|dubstep)\b/i.test(primary)||
      Object.values(danceStyles).some(rule=>rule.test(primary))
    if(conflicting&&!dnbEvidence.test(primary))return false
    if(styles[genre].test(listed)&&(!dnbNeedsFamily.has(genre)||dnbEvidence.test(listed)))return true
    const style=dnbTerms[genre]
    const labelled=new RegExp('\\b(?:'+style+'[\\s/-]*'+dnbName+'|'+dnbName+'[\\s/-]*'+style+')\\b','i')
    const description=typeof track.uploaderDescription==='string'?
      track.uploaderDescription.split(/\r?\n/).slice(0,4).filter(line=>line.length<=120).join(' '):''
    if(labelled.test([track.title,description].join(' ')))return true
    if(genre==='Liquid DnB'&&new RegExp('\\b'+dnbName+'\\b','i').test(track.listedGenre||'')){
      return /\bliquid\s+(?:edit|bootleg|remix|flip)\b/i.test(track.title||'')
    }
    return false
  }
  return danceGenreMatches(track,genre)
}
function similarGenreMatches(track,genre){
  const labels={...track}
  for(const field of ['listedGenre','listedTags','styleTags','title','uploaderDescription']){
    if(typeof labels[field]==='string')labels[field]=labels[field]
      .replace(/\b\d{2,3}(?:\.\d+)?\s*bpm\b|\bbpm\s*[:=]?\s*\d{2,3}(?:\.\d+)?\b/gi,' ')
  }
  return genreMatches(labels,genre)
}
const subgenreSearch={
  'DnB Rollers':{tag:'rollers',alias:'drum and bass rollers',alternate:{query:'rollers free download',tag:'drum & bass',medium:true}},
  'Jump Up':{tag:'jump up',alias:'jumpup drum and bass'},
  Jungle:{tag:'jungle',alias:'jungle drum and bass'},
  'Liquid DnB':{tag:'liquid',alias:'liquid drum and bass'},
  'Dancefloor DnB':{tag:'dancefloor',alias:'dancefloor drum and bass'},
  Neurofunk:{tag:'neurofunk',alias:'neurofunk drum and bass'},
  'UK Garage':{tag:'uk garage',alias:'2 step ukg'},
  'Speed Garage':{tag:'speed garage',alias:'speedgarage'},
  Bassline:{tag:'bassline',alias:'uk bassline garage'},
  House:{tag:'house',alias:'house music dj extended mix'},
  'Tech House':{tag:'tech house',alias:'techhouse'},
  'Deep House':{tag:'deep house',alias:'deephouse'},
  Techno:{tag:'techno',alias:'techno original mix'},
  'Hard Techno':{tag:'hard techno',alias:'hardtechno'},
  Dubstep:{tag:'dubstep',alias:'dubstep'},
  'Deep Dubstep / 140':{tag:'deep dubstep',alias:'140 dubstep'},
  Trance:{tag:'trance',alias:'trance extended mix'},
  'Hard Dance / Hardstyle':{tag:'hardstyle',alias:'hard dance hardstyle'},
  Breakbeat:{tag:'breakbeat',alias:'breakbeat breaks'}
}
function queryPlan(term,artists,genre){
  const style=subgenreSearch[genre]
  return [
    ...(style?[{query:'free download',tag:style.tag,medium:true},style.alternate||{query:style.alias+' free download',medium:true}]:[]),
    ...[...new Set([term+' free download',term+' free dl',...artists.map(a=>a+' '+term+' free download'),
      style?style.alias+' free download':term+' free track'])].map(query=>({query})),
    ...(style?[{query:'free download',tag:style.tag}]:[])
  ]
}
function similarQueries(term,key,input){
  const position=minor.indexOf(Number(key.slice(0,-1)))
  const major=key.endsWith('B')
  const pitch=(position+(major?3:0))%12
  const flatNames=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
  const mode=major?' major':' minor'
  const names=new Set([noteNames[pitch]+mode,flatNames[pitch]+mode,key,input])
  return [...new Set([...Array.from(names,name=>term+' '+name),term+' '+key+' free download',term])]
}
function seedSearchPlan(track,style,term,strictKey=''){
  const {styleEvidence,originalTitle}=require('./similar')
  const clean=value=>(typeof value==='string'?value:'').normalize('NFKC')
    .replace(/\b\d{2,3}(?:\.\d+)?\s*bpm\b|\bbpm\s*[:=]?\s*\d{2,3}(?:\.\d+)?\b/gi,' ')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim().slice(0,64)
  const names=(track.creditedArtist||track.artist||'').split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)
    .map(clean).filter(Boolean).slice(0,2)
  const label=clean(track.labelName)
  const original=originalTitle(track).slice(0,80)
  const tags=styleEvidence(track).sort((first,second)=>Number(/^(?:deep|dark|vocal|minimal)$/.test(first))-
    Number(/^(?:deep|dark|vocal|minimal)$/.test(second))).slice(0,2)
  const catalogTag=subgenreSearch[style]?.tag
  const plans=[
    ...(strictKey?[{source:'key',query:similarQueries(term,strictKey,strictKey)[0],medium:true}]:[]),
    ...(original?[{source:'remix',query:original}]:[]),
    ...tags.map(tag=>({source:'tag',query:term+' '+tag})),
    ...(label?[{source:'label',query:label+' '+term}]:[]),
    ...names.map((name,index)=>({source:index?'collaboration':'artist',query:name+' '+term})),
    {source:'subgenre',...queryPlan(term,[],style)[0]},
    {source:'subgenre',query:term,tag:catalogTag},
    {source:'subgenre',query:subgenreSearch[style]?.alias||term,medium:true},
  ]
  return [...new Map(plans.map(plan=>[JSON.stringify([plan.query.toLowerCase(),plan.tag,plan.medium]),plan])).values()]
}
function isTuneListing(track){
  const slug=new URL(track.url).pathname.split('/').pop().replace(/[-_]+/g,' ')
  const title=[track.listedTitle||track.title,slug].filter(Boolean).join(' ')
  const djSet=/\b(?:dj\s*(?:mix(?:es)?|sets?)|mix\s*sets?|mix\s*tapes?|guest\s*mix|mini\s*mix|live\s*set|continuous\s*mix|essential\s*mix|mix\s*(?:series|session|show)|radio\s*(?:show|mix|episode)|podcast|track\s*list|(?:\d+\s*)?(?:min(?:ute)?s?|hours?|hrs?)\s+mix)\b/i
  if(djSet.test(title))return false
  const pack=/\b(?:samples?|loops?|presets?|sound effects|stems?)\s*[-–]?\s*(?:packs?|kits?|bundles?)\b|\b(?:sample library|construction kit)\b/i
  if(pack.test(title)||/\b(?:vol(?:ume)?\.?\s*\d+|sample|preset|sound (?:design|library))\s+(?:pack\s+)?showcase\b/i.test(title))return false
  const productTags=track.listedTags||''
  if(!pack.test(productTags)&&!/\bserum(?:\s+\d+)?\s+presets\b/i.test(productTags))return true
  const headline=track.uploaderDescription?.trim().split(/\r?\n/,1)[0]||''
  const storeProduct=(track.links||[]).some(link=>/\/products\/[^?#]*(?:presets|sample-pack|drum-pack|loop-pack)(?:\b|_)/i.test(link))
  return !storeProduct&&!pack.test(headline)&&!/\b(?:serum(?:\s+\d+)?\s+presets|drum pack)\b/i.test(headline)
}
function isFreeTrack(track){
  if(!isTuneListing(track))return false
  const slug=new URL(track.url).pathname.split('/').pop().replace(/[-_]+/g,' ')
  const title=track.title+' '+slug
  const metadata=title+' '+(track.tags||'')
  return track.downloadable || /\b(?:free\s*[-–]?\s*(?:download|dl)|download\s+(?:it\s+)?for\s+free)\b/i.test(metadata) ||
    (track.actions||[]).some(action=>/\bfree\s+(?:download|dl)\b/i.test(action.label) && /^https:\/\//i.test(action.url))
}
function trackMetadata(html,url){
  const hydration=html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\])\s*;?\s*<\/script>/i)?.[1]
  if(!hydration)return null
  try{
    const sound=JSON.parse(hydration).find(entry=>entry.hydratable==='sound' && trackURL(entry.data?.permalink_url)===url)?.data
    if(!sound)return null
    const duration=sound.full_duration ?? sound.duration
    const date=[['Release date listed by uploader',sound.release_date],['Uploaded',sound.created_at]]
      .map(([label,value])=>({label,time:Date.parse(value)}))
      .find(item=>item.time>0 && item.time<=Date.now())
    const publisher=sound.publisher_metadata||{}
    const isrc=typeof publisher.isrc==='string'?publisher.isrc.replaceAll('-','').toUpperCase():''
    return {duration, date, artist:sound.user?.username, links:[sound.purchase_url].filter(Boolean),
      uploadedAt:Date.parse(sound.created_at),uploaderProfile:sound.user?.permalink_url,
      playable:sound.streamable===false||sound.policy==='BLOCK'||sound.sharing==='private'?false:undefined,
      listedArt:/^https:\/\/i[12]\.sndcdn\.com\//.test(sound.artwork_url||'')?sound.artwork_url:'',
      listedTitle:sound.title,trackId:sound.urn||String(sound.id??''),creditedArtist:publisher.artist,
      labelName:publisher.label_name||sound.label_name,isrc:/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)?isrc:'',
      purchaseTitle:sound.purchase_title, downloadable:sound.downloadable===true && sound.has_downloads_left!==false,
      listedGenre:sound.genre, listedTags:sound.tag_list, uploaderDescription:sound.description,
      keySignature:sound.key_signature??sound.publisher_metadata?.key_signature,
      tags: [sound.genre,sound.tag_list].filter(Boolean).join(' ')}
  }catch{return null}
}
async function deadline(promise,ms){
  let timer
  try{return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(new Error('SoundCloud timed out.'),{code:'SEARCH_TIMEOUT'})),ms)
  })])}
  finally{clearTimeout(timer)}
}
// Runs inside the SoundCloud search page; only read metadata belonging to each result.
function readRows(related=false){
  let scope=document
  let selector='a.soundTitle__title,a[itemprop="url"],h2 a[href]'
  if(related){
    const headings=document.querySelectorAll('h2,h3,h4,.sidebarHeader,.sidebarHeader__title')
    const heading=Array.from(headings).find(node=>/^\s*related tracks(?:\s+view all)?\s*$/i.test(node.textContent))
    scope=heading?.closest('.sidebarModule,.relatedTracks,.mixedRecommendations')
    if(!scope)return []
    selector='a.soundBadge__title,a.soundTitle__title,a[itemprop="url"],a[href]'
  }
  return Array.from(scope.querySelectorAll(selector),a=>{
    const row=a.closest('.sound,.searchItem,li')
    const art=row?.querySelector('.sound__artwork span[style],.sound__artwork img')
    const image=art?.src || (art?.style.backgroundImage||'').slice(4,-1).replaceAll('"','')
    const styleTags=Array.from(row?.querySelectorAll('.sc-tagContent,[class*="genreTag"],.sound__tags')||[],n=>n.textContent).join(' ')
    const descriptions=Array.from(row?.querySelectorAll('.soundDescription__text,.soundDescription__description')||[],n=>n.textContent).join(' ')
    const artist=row?.querySelector('[itemprop="byArtist"]')
    const links=Array.from(row?.querySelectorAll('a.buyButton, a.sc-button-buy, .soundDescription__text a[href], .soundDescription__description a[href]') || [],link=>link.href)
    const actions=Array.from(row?.querySelectorAll('a.buyButton, a.sc-button-buy, .soundDescription__text a[href], .soundDescription__description a[href]')||[],
      link=>({url:link.href,label:link.textContent.trim()||link.title}))
    const uploaded=row?.querySelector('time[datetime]')?.dateTime
    return {links,actions,uploaded,url:a.href,title:a.textContent.trim()||a.title,tags:[styleTags,descriptions].filter(Boolean).join(' '),styleTags,description:descriptions,
      artist:(artist?.getAttribute('content')||artist?.textContent||'').trim(),
      art:/^https:\/\/i[12]\.sndcdn\.com\//.test(image)?image:''}
  })
}
function gateURL(value){
  try{
    let u=new URL(value)
    if(u.origin==='https://gate.sc' && !u.username && !u.password && u.pathname==='/'){
      const targets=u.searchParams.getAll('url')
      if(targets.length!==1)return ''
      u=new URL(targets[0])
    }
    const hosts=['hypeddit.com','www.hypeddit.com','theartistunion.com','toneden.io','www.toneden.io']
    return u.protocol==='https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname) && u.pathname!=='/' ? u.href : ''
  }catch{return ''}
}
function profileURL(track){
  const url=trackURL(track.url)
  return url?url.slice(0,url.lastIndexOf('/')):''
}
function waveformSections(samples,duration,windowMs){
  if(!Array.isArray(samples)||samples.length<100||samples.length>10000||
      !Number.isFinite(duration)||duration<windowMs*1.6||duration>600000||
      !samples.every(value=>Number.isFinite(value)&&value>=0))return null
  const length=Math.ceil(samples.length*windowMs/duration)
  const reference=[...samples].sort((a,b)=>a-b)[Math.floor(samples.length*0.95)]
  if(!reference)return []
  const step=Math.max(1,Math.round(samples.length*1000/duration))
  const candidates=[]
  for(let start=Math.ceil(samples.length*0.15);start<=samples.length*0.77&&start+length<=samples.length*0.94;start+=step){
    const amplitudes=samples.slice(start,start+length).sort((a,b)=>a-b)
    const lower=amplitudes[Math.floor(length*0.2)]/reference
    const middle=amplitudes[Math.floor(length*0.5)]/reference
    if(lower<0.16||middle<0.3)continue
    const score=0.7*lower+0.3*middle-0.5*Math.abs(start/samples.length-0.32)
    candidates.push({score,position:Math.round(start*duration/samples.length)})
  }
  const sections=[]
  for(const {position} of candidates.sort((a,b)=>b.score-a.score)){
    if(sections.every(start=>Math.abs(start-position)>=windowMs))sections.push(position)
    if(sections.length===3)break
  }
  return sections
}
function destinations(track){
  const items=[{url:track.url,label:'SoundCloud',kind:'track'}]
  if(track.downloadable)items.push({url:track.url,label:'Free download on SoundCloud',kind:'download',
    provider:'SoundCloud',domain:'soundcloud.com'})
  const actions=new Map((track.links||[]).map(url=>[url,'']))
  for(const {url,label} of track.actions||[]){
    const existing=actions.get(url)
    actions.set(url,[existing,label].filter(Boolean).join(' '))
  }
  const lines=typeof track.uploaderDescription==='string'?track.uploaderDescription.split(/\r?\n/):[]
  for(let i=0;i<Math.min(lines.length,30);i++){
    const match=/^\s*(free\s+(?:download|dl)(?:\s+link)?|download\s+link|dl\s+link)\s*(?:[:–-]\s*)?(https:\/\/\S+)?\s*$/i.exec(lines[i])
    const href=match&&(match[2]||/^\s*(https:\/\/\S+)\s*$/.exec(lines[i+1]||'')?.[1])
    if(href&&!actions.get(href))actions.set(href,/^free/i.test(match[1])?'Free download':'Download link')
  }
  for(const [url,label] of actions){
    try{
      const target=new URL(url)
      if(target.protocol!=='https:'||target.username||target.password||target.port)continue
      const gate=gateURL(url)
      const free=/\bfree\s+(?:download|dl)\b/i.test(label)
      const buy=/\b(?:buy|purchase)\b/i.test(label)
      const download=/\bdownload link\b/i.test(label)
      if(!gate&&!free&&!buy&&!download)continue
      const href=gate||target.href
      if(items.some(item=>item.url===href))continue
      const domain=new URL(href).hostname
      const providers={'hypeddit.com':'Hypeddit','theartistunion.com':'The Artist Union','toneden.io':'ToneDen',
        'soundcloud.com':'SoundCloud','bandcamp.com':'Bandcamp'}
      const provider=providers[domain.replace(/^www\./,'')]||(domain.endsWith('.bandcamp.com')?'Bandcamp':domain)
      items.push({url:href,kind:buy&&!gate&&!free&&!download?'purchase':'download',provider,domain,
        label:free?'Free download':download?'Download link':buy?'Buy':'Download gate'})
    }catch{}
  }
  return items
}
function savedDownloadDetails(state){
  return {email:typeof state.email==='string'?state.email:'',
    comment:typeof state.downloadComment==='string'?state.downloadComment:typeof state.comment==='string'?state.comment:''}
}
function validateDownloadDetails(email,comment){
  if(typeof email!=='string'||typeof comment!=='string')throw Error('Enter an email address or leave it blank.')
  email=email.trim()
  comment=comment.trim()
  if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Enter a valid email address.')
  if(comment.length>300)throw Error('Keep your comment to 300 characters or fewer.')
  return {email,comment}
}
module.exports={gateURL,styles,musicalKey,listedTrackKey,trackURL,classify,genreMatches,similarGenreMatches,queryPlan,similarQueries,seedSearchPlan,isTuneListing,isFreeTrack,trackMetadata,deadline,readRows,profileURL,destinations,waveformSections,savedDownloadDetails,validateDownloadDetails}
