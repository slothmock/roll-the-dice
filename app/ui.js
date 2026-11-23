const el=id=>document.getElementById(id)
const say=text=>el('status').textContent=text
document.addEventListener('keydown',event=>{
  if(event.key==='Tab')document.documentElement.classList.add('keyboard-navigation')
},true)
document.addEventListener('pointerdown',()=>document.documentElement.classList.remove('keyboard-navigation'),true)
const friendsBeta=dice.friendsBeta
if(friendsBeta){
  document.body.classList.add('friends-beta')
  for(const id of ['similar','matches','analysisDialog','trackKey','similarGuide','similarGuideDetails'])el(id).remove()
  el('deckColumn').append(el('discoverFeed'))
  el('feedTitle').textContent='Latest from your favourites'
}
let current, busy=false, rated=false
const similarStyles=new Map()
let rollRevision=0
function action(fn){return async event=>{try{await fn(event)}catch(e){
  say(e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''))
}}}
function paintStars(value){
  for(const button of el('stars').querySelectorAll('button')){
    const n=Number(button.value)
    button.textContent=n<=value?'★':'☆'
    button.classList.toggle('on',n<=value)
    button.setAttribute('aria-pressed',String(n===value))
  }
}
for(let n=1;n<=5;n++){
  const b=document.createElement('button')
  b.value=n;b.setAttribute('aria-label',n+' out of 5 stars')
  el('stars').append(b)
}
function show(track,arm){
  current=track
  const [,artist,slug]=new URL(track.url).pathname.split('/')
  el('artist').textContent=track.artist||artist.replaceAll('-',' ')
  el('track').textContent=track.title||slug.replaceAll('-',' ')
  el('track').title=el('track').textContent
  el('art').hidden=true;el('fallback').hidden=false
  if(track.art){el('art').src=track.art}else{el('art').removeAttribute('src')}
  el('player').src='https://w.soundcloud.com/player/?url='+encodeURIComponent(track.url)+'&visual=false&show_artwork=true&show_related=false&color=%231455ff'
  for(const id of ['trackTools','destinations','player','stars','favourite'])el(id).hidden=false
  checkPreview(track)
  el('undo').disabled=!track.canUndo
  paintStars(track.stars)
  paintTrackActions()
  if(!friendsBeta){
    el('matchStyle').value=[track.genre,...(track.genres||[])].find(style=>similarStyles.has(style))||el('genre').value
    paintKey()
    setPreparation(track,arm)
  }
  el('retryRoll').hidden=true
  say('')
  ensureFeed()
}
el('art').onload=()=>{el('art').hidden=false;el('fallback').hidden=true}
el('art').onerror=()=>{el('art').hidden=true;el('fallback').hidden=false}
async function change(fn,rolling=false){
  if(busy)return
  if(!friendsBeta)clearSimilar()
  const arm=friendsBeta?null:armCapture()
  let accepted=false
  const revision=rollRevision
  busy=true;el('roll').disabled=true
  el('genre').disabled=!rolling
  el('fresh').disabled=!rolling
  try{
    const track=await fn()
    if(!rolling||revision===rollRevision){
      selectPage('discover')
      show(track,arm)
      accepted=true
    }
  }catch(error){
    if(!rolling||revision===rollRevision)throw error
  }finally{
    if(!accepted)arm?.controller.abort()
    busy=false
    el('roll').disabled=!el('genre').value
    el('genre').disabled=el('fresh').disabled=false
  }
}
function prepareRoll(){
  rollRevision++
  el('retryRoll').hidden=true
  el('roll').disabled=busy||!el('genre').value
  dice.prepareRoll(el('genre').value,el('fresh').checked).catch(()=>{})
}
function dialLabel(){
  const value=el('dial').value
  el('dial').style.setProperty('--level',value+'%')
}
const selectPage=initializeNavigation({el,friendsBeta,dismissSimilar,ensureFeed})
action(async()=>{
  const {genreMenu,selectedGenre,downloadDetails:details,wildcard,profile,version,showGuideAtStartup}=await dice.setup()
  if(friendsBeta){
    document.title='Roll the Dice Friends Beta'
    el('edition').textContent='Friends Beta · '+version
    el('edition').hidden=false
  }
  settings.setup(genreMenu,profile,selectedGenre)
  const menu=el('genre')
  el('roll').disabled=!el('genre').value
  el('fresh').onchange=()=>{if(busy)say('');prepareRoll()}
  el('genre').onchange=()=>{
    el('fresh').onchange()
    if(!friendsBeta&&current&&similarStyles.has(menu.value)&&el('matchStyle').value!==menu.value){
      el('matchStyle').value=menu.value
      changeSimilarStyle()
    }
  }
  prepareRoll()
  downloadAssistant.setDetails(details)
  el('dial').value=wildcard;dialLabel()
  collections.setup(await dice.artistFavourites())
  settings.showStartupGuide(showGuideAtStartup)
})()
el('dial').oninput=dialLabel
el('dial').onchange=action(()=>{
  if(busy){rollRevision++;say('')}
  return dice.dial(Number(el('dial').value))
})
el('roll').onclick=action(async()=>{
  selectPage('discover')
  el('retryRoll').hidden=true
  try{await change(()=>{say('Digging through SoundCloud…');return dice.roll(el('genre').value,el('fresh').checked)},true)}
  catch(error){el('retryRoll').hidden=false;throw error}
})
el('retryRoll').onclick=()=>el('roll').click()
el('undo').onclick=action(()=>{selectPage('discover');return change(()=>dice.undo())})
el('soundCloudLink').onclick=action(async()=>{if(current)say(await dice.gate(current.url,current.url))})
el('copyLink').onclick=action(async()=>{if(current){await dice.copy(current.url);say('Track link copied.')}})
async function rate(value){
  if(!current||busy||rated)return
  const url=current.url;rated=true
  try{await dice.rate(url,value);if(current.url===url){paintStars(value);say('Saved '+value+' out of 5.')}}finally{rated=false}
}
el('stars').onclick=action(e=>{if(e.target.tagName==='BUTTON')return rate(Number(e.target.value))})
document.addEventListener('keydown',action(async e=>{
  if(e.defaultPrevented||e.repeat||e.altKey||e.ctrlKey||e.metaKey)return
  const key=e.key.toLowerCase()
  if(!friendsBeta&&el('analysisDialog').open){
    if(key==='escape'){e.preventDefault();dismissSimilar(true);return}
  }
  if(el('guide').open||el('settingsDialog').open||e.target.closest?.('input,select,textarea,[contenteditable]:not([contenteditable=false])'))return
  if(key==='r')el('roll').click()
  else if(key==='z')el('undo').click()
  else if(/^[1-5]$/.test(key))await rate(Number(key))
  else if(key===' '&&current&&!e.target.closest?.('button,a,summary')){e.preventDefault();el('player').contentWindow.postMessage(JSON.stringify({method:'toggle'}),'https://w.soundcloud.com')}
}))

const settings=initializeSettings({el,dice,prepareRoll,similarStyles,friendsBeta})
if(!friendsBeta)el('matchStyle').add(new Option('Choose subgenre',''))

const {estimate,openPlayback,capturePlayback,captureSeconds,earlyCheckSeconds,captureFailure}=createAudioCapture()

const {widgetRequest,checkPreview,playerTrackURL}=createPlayerWidget({el})

const similarityUI=initializeSimilarityUI({el,action,dice,friendsBeta,getCurrent:()=>current,isBusy:()=>busy,
  similarStyles,trackRow,estimate,openPlayback,capturePlayback,captureSeconds,earlyCheckSeconds,captureFailure,
  widgetRequest,playerTrackURL,keyEvidence,keySourceLabels,sameKeyIssue,similarTrackURL,trackIdentity,rankEvidence,selectSimilar})
function paintKey(){return similarityUI.paintKey()}
function setPreparation(track,arm){return similarityUI.setPreparation(track,arm)}
function clearSimilar(){return similarityUI.clearSimilar()}
function armCapture(){return similarityUI.armCapture()}
function dismissSimilar(cancel=false){return similarityUI.dismissSimilar(cancel)}
function changeSimilarStyle(){return similarityUI.changeSimilarStyle()}

const downloadAssistant=initializeDownloadAssistant({el,action,dice,getCurrent:()=>current})
const collections=initializeCollections({el,action,dice,getCurrent:()=>current,isBusy:()=>busy,change,similarStyles,downloadAssistant,friendsBeta})
function paintTrackActions(){return collections.paintTrackActions()}
function ensureFeed(){return collections.ensureFeed()}
function trackRow(...args){return collections.trackRow(...args)}
initializeCharts({el,action,dice,trackRow})

