const {app,BrowserWindow,ipcMain,session,shell,clipboard,WebContentsView,screen,dialog,components}=require('electron')
const fs=require('node:fs')
const path=require('node:path')
const {friendsBeta=false,version}=require('./package.json')
const {genres,genreMenu,visibleGenre,visibleGenres,pick,pickTerm}=require('./core')
const {keyEvidence,styleEvidence,trackIdentity,duplicateUpload,durationIssue,describeRecommendation,rankEvidence,selectSimilar}=require('./similar')
const {soundCloudProfile,verifiedUpload,byUploadDate,favouriteStatus,mergeFavouriteCheck,publicProfileUploads}=require('./favourites')
const {pathToFileURL}=require('node:url')
const {openLibrary}=require('./library')
const registerCharts=require('./main/charts')
const createDiscoveryRetrieval=require('./main/discovery-retrieval')
const createRollCoordinator=require('./main/roll-coordinator')
const createFavouriteUploads=require('./main/favourite-uploads')
const createSimilaritySearch=require('./main/similarity-search')
let ui, state, stateFile, library, searching=false
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const isPlaybackKey=key=>typeof key==='string'&&/^(?:[1-9]|1[0-2])[AB]$/.test(key)
function save(){library.save()}
function web(show,discovery=false){
  const w=new BrowserWindow({show,width:980,height:780,webPreferences:{partition:'persist:music',
    sandbox:true,contextIsolation:true,nodeIntegration:false,images:!discovery}})
  w.webContents.setWindowOpenHandler(({url})=>{
    if(url.startsWith('https://')) setImmediate(()=>{if(!w.isDestroyed())w.loadURL(url).catch(()=>{})})
    return {action:'deny'}
  })
  w.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('https://'))e.preventDefault()})
  return w
}
function local(name,fn){
  ipcMain.handle(name,(event,...args)=>{
    if(event.sender!==ui.webContents || event.senderFrame!==ui.webContents.mainFrame)throw Error('Invalid window')
    const senderURL=new URL(event.senderFrame.url)
    senderURL.hash=''
    if(senderURL.href!==pathToFileURL(path.join(__dirname,'index.html')).href)throw Error('Invalid window')
    return fn(...args)
  })
}
function startupFailure(error){
  dialog.showErrorBox('Could not open your library',
    'The app could not safely load or restore its library. No empty library was substituted.\n'+
    (stateFile||'')+'\n'+error.message)
  app.quit()
}
// Select and, when needed, migrate the library before Electron creates the profile.
try{
if(app.isPackaged || process.platform==='win32'){
  const override=friendsBeta&&app.commandLine.getSwitchValue('user-data-dir')
  const appData=override?null:app.getPath('appData')
  const profile=override?path.resolve(override):
    path.join(appData,friendsBeta?'roll-the-dice-desktop':'roll-the-dice')
  if(friendsBeta&&!override)require('./main/profile-migration')({fs,appData,profile})
  fs.mkdirSync(profile,{recursive:true})
  app.setPath('userData',profile)
  app.setPath('sessionData',profile)
}
if(process.platform==='win32') app.setAppUserModelId('app.rollthedice.desktop')
if(!app.requestSingleInstanceLock()){
  app.quit()
}else{
app.on('second-instance',()=>{
  if(ui&&!ui.isDestroyed()){
    if(ui.isMinimized())ui.restore()
    ui.focus()
  }
})
app.whenReady().then(async()=>{
  try{await components.whenReady()}
  catch{
    dialog.showMessageBoxSync({type:'warning',title:'Protected playback unavailable',
      message:'Protected audio could not be set up. Check your connection and restart the app to try again. Ordinary tracks are still available.',
      buttons:['Continue'],defaultId:0,noLink:true})
  }
  stateFile=path.join(app.getPath('userData'),'crate.json')
  library=openLibrary(stateFile,{fs,onRecovery:({file,hasBackup,preservedPaths})=>
    dialog.showMessageBoxSync({type:'warning',title:'Library recovery',
      message:hasBackup?'Your library could not be loaded. Restore the last saved backup?':
        'Your library could not be loaded and no valid backup is available.',
      detail:'Library: '+file+'\n'+(hasBackup?'The backup may not contain your latest changes.':
        'Starting empty does not recover your saved tracks or ratings.')+
        '\nDamaged files will be preserved at:\n'+preservedPaths.join('\n'),
      buttons:[hasBackup?'Restore backup':'Start empty library','Quit'],defaultId:1,cancelId:1,noLink:true})===0})
  if(!library){app.quit();return}
  state=library.state
  const history=[]
  let activeTrack, playbackRevision=0
  const {width,height}=screen.getPrimaryDisplay().workAreaSize
  ui=new BrowserWindow({width:Math.min(1450,width),height:Math.min(850,height),
    minWidth:Math.min(520,width),minHeight:Math.min(460,height),autoHideMenuBar:true,
    icon:path.join(__dirname,'assets','app.ico'),backgroundColor:'#101216',
    webPreferences:{preload:path.join(__dirname,'preload.js'),sandbox:true,
      additionalArguments:friendsBeta?['--roll-dice-friends-beta']:[]}})
  ui.webContents.on('will-navigate',e=>e.preventDefault())
  ui.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  if(!friendsBeta)ui.webContents.session.setDisplayMediaRequestHandler((request,grant)=>{
    const frame=ui.isDestroyed()?null:ui.webContents.mainFrame
    if(!frame || request.frame!==frame || !request.userGesture || !request.audioRequested ||
        frame.url!==pathToFileURL(path.join(__dirname,'index.html')).href)return grant(null)
    grant({video:frame,audio:frame,enableLocalEcho:true})
  })
  ui.on('closed',()=>app.quit())
  const music=session.fromPartition('persist:music')
  music.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false))
  music.on('will-download',event=>event.preventDefault())
  function visibleProfile(){
    return state.profile?{...state.profile,genres:visibleGenres(state.profile.genres)}:null
  }
  function selectedGenre(requested){
    if(requested==='@favourites'&&visibleGenres(state.profile?.genres).length>1)return requested
    return visibleGenre(requested)
  }
  local('setup',()=>({genreMenu,selectedGenre:selectedGenre(state.discoveryGenre)||'DnB Rollers',
    downloadDetails:savedDownloadDetails(state),wildcard:state.wildcard,profile:visibleProfile(),version,
    showGuideAtStartup:state.showGuideAtStartup!==false}))
  local('guideStartup',show=>{
    if(typeof show!=='boolean')throw Error('Invalid guide startup preference.')
    if(show===(state.showGuideAtStartup!==false))return show
    state.showGuideAtStartup=show
    save()
    return show
  })
  local('dial',value=>{
    if(!Number.isInteger(value)||value<0||value>100)throw Error('Invalid wildcard setting.')
    if(value===state.wildcard)return
    state.wildcard=value;save()
    refreshRollPreparation()
  })
  function showTrack(track){
    cancelSimilar()
    results.clear()
    activeTrack=track
    const playbackKey=state.playbackKeys?.[track.url]
    return {...track,playbackRevision:++playbackRevision,profile:profileURL(track),destinations:destinations(track),
      publishedKey:listedTrackKey(track),freeDownload:isFreeTrack(track),
      playbackKey:isPlaybackKey(playbackKey)?playbackKey:'', estimatedKey:state.estimatedKeys?.[track.url]||'',
      stars:state.ratings[track.url]?.stars || 0,canUndo:history.length>0}
  }
  local('undo',()=>{
    if(searching||!history.length)throw Error('No earlier roll.')
    return showTrack(history.pop())
  })
  local('rate',(url,stars)=>{
    if(url!==activeTrack?.url || !Number.isInteger(stars) || stars<1 || stars>5)throw Error('Choose a track and a rating from 1 to 5.')
    const previous=state.ratings[url]
    state.ratings[url]={
      stars,term:activeTrack.term,
      title:activeTrack.title || previous?.title || '',
      styleTags:activeTrack.styleTags || previous?.styleTags || '',
      artist:activeTrack.artist || previous?.artist || ''
    }
    try{save()}catch(error){
      if(previous)state.ratings[url]=previous
      else delete state.ratings[url]
      throw error
    }
  })
  local('copy',async reaction=>{
    if(typeof reaction!=='string'||!reaction.trim()||reaction.length>300)throw Error('There is no text to copy.')
    const value=reaction.trim()
    try{
      await clipboard.writeText(value)
      if(await clipboard.readText()!==value)throw Error('Clipboard write could not be verified.')
    }catch{throw Error('Could not copy to the clipboard. Select and copy the text manually.')}
  })
  local('saveDownloadDetails',(email,comment)=>{
    const details=validateDownloadDetails(email,comment)
    const previousEmail=state.email, previousComment=state.downloadComment
    state.email=details.email
    state.downloadComment=details.comment
    try{save()}catch(error){
      state.email=previousEmail
      state.downloadComment=previousComment
      throw error
    }
    return details
  })
  local('clearDownloadEmail',()=>{
    saveEntry(state,'email','')
    return savedDownloadDetails(state)
  })
  const {listedTrackKey,trackURL,genreMatches,similarGenreMatches,queryPlan,seedSearchPlan,isTuneListing,isFreeTrack,trackMetadata,deadline,readRows,profileURL,destinations,savedDownloadDetails,validateDownloadDetails}=require('./discovery')
  const seen=new Set(state.seen)
  const retrieval=createDiscoveryRetrieval({music,trackMetadata,trackURL,deadline,readRows,sleep})
  const {getTrackMetadata,enrich,mergeTrackMetadata,scan,filteredSearch,respectBackoff}=retrieval
  let results=new Map()
  function remember(track){
    if(!seen.has(track.url)){state.seen.push(track.url);save();seen.add(track.url)}
    if(activeTrack && activeTrack.url!==track.url){history.push(activeTrack);if(history.length>200)history.shift()}
    return showTrack(track)
  }
  async function runSearch(fn){
    if(searching)throw Error('A search is already running.')
    searching=true
    try{return await fn()}
    finally{searching=false}
  }
  local('profile',(selected,artists)=>{
    if(!Array.isArray(selected)||!Array.isArray(artists))throw Error('Invalid preferences.')
    const before=state.profile||{genres:[],artists:[]}
    const savedGenres=[...visibleGenres(selected),...(before.genres||[]).filter(genre=>!visibleGenre(genre))]
    state.profile={...before,genres:[...new Set(savedGenres)],artists:artists.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,70)).filter(Boolean).slice(0,8)}
    save()
    if(JSON.stringify(before)!==JSON.stringify(state.profile))refreshRollPreparation()
    return visibleProfile()
  })
  function cancelSimilar(requestId){return similarity.cancelSimilar(requestId)}
  if(!friendsBeta)local('cancelSimilar',cancelSimilar)
  const roll=createRollCoordinator({local,state,selectedGenre,visibleGenres,genres,pickTerm,pick,
    history,getActiveTrack:()=>activeTrack,getFavouriteChecks:()=>favouriteUploads.checks,seen,profileURL,
    save,web,retrieval,queryPlan,sleep,runSearch,cancelSimilar,results,remember,isFreeTrack,genreMatches})
  const {refreshRollPreparation,pruneRollPool,preparePool,scheduleRefill,rollTimeout}=roll
  const similarity=createSimilaritySearch({local,friendsBeta,state,
    getActiveTrack:()=>activeTrack,getPlaybackRevision:()=>playbackRevision,isSearching:()=>searching,
    results,getFeed:()=>favouriteUploads.feed,ui,music,web,retrieval,genres,keyEvidence,styleEvidence,trackIdentity,
    duplicateUpload,durationIssue,describeRecommendation,rankEvidence,selectSimilar,listedTrackKey,trackURL,
    similarGenreMatches,seedSearchPlan,isTuneListing,profileURL,soundCloudProfile,publicProfileUploads,remember})
  const {similarDiagnostics}=similarity
  function saveEntry(entries,key,value){
    const previous=entries[key]
    if(value===undefined)delete entries[key]
    else entries[key]=value
    try{save()}catch(error){
      if(previous===undefined)delete entries[key]
      else entries[key]=previous
      throw error
    }
  }
  if(!friendsBeta)local('savePlaybackKey',(url,key,revision)=>{
    if(url!==activeTrack?.url || revision!==playbackRevision || !isPlaybackKey(key))throw Error('The track changed. Try again.')
    state.playbackKeys ??= {}
    saveEntry(state.playbackKeys,url,key)
  })
  const favouriteUploads=createFavouriteUploads({local,state,getActiveTrack:()=>activeTrack,isSearching:()=>searching,
    profileURL,saveEntry,refreshRollPreparation,roll,ui,music,web,retrieval,genres,similarDiagnostics,
    duplicateUpload,soundCloudProfile,verifiedUpload,byUploadDate,favouriteStatus,mergeFavouriteCheck,publicProfileUploads,durationIssue})
  let recommended=new Map()
  local('listenTrack',url=>{
    const track=favouriteUploads.feed.get(url)||recommended.get(url)
    if(searching||!trackURL(url)||!track)throw Error('Choose an available track.')
    return remember(track)
  })
  local('recommendations',async()=>{
    const target=roll.selection
    if(!target)return {rows:[],status:'empty'}
    pruneRollPool(target)
    if(!target.pool.size)await preparePool(target,rollTimeout,true)?.waitForTrack()
    if(roll.selection!==target)return {rows:[],status:'cancelled'}
    pruneRollPool(target)
    const choices=[...target.pool.keys()], rows=[]
    while(choices.length&&rows.length<6){
      const url=pick(choices,[],state.ratings,Math.random,state.wildcard/100,state.profile?.artists||[],
        target.pool,Object.keys(state.artistFavourites))
      if(!url)break
      rows.push(target.pool.get(url))
      choices.splice(choices.indexOf(url),1)
    }
    recommended=new Map(rows.map(track=>[track.url,track]))
    return {rows,status:rows.length?'ready':'empty'}
  })
  registerCharts({ui,local,WebContentsView,session,shell,deadline})
  local('gate',async (url,destination)=>{
    if(!activeTrack || url!==activeTrack.url || trackURL(url)!==url)throw Error('Select a SoundCloud track first.')
    if(!destinations(activeTrack).some(item=>item.url===destination))throw Error('Destination unavailable.')
    try{await shell.openExternal(destination)}
    catch{throw Error('Could not open the default browser. Use Copy track link and paste it into your browser.')}
    return 'Opened in your browser.'
  })
  ui.loadFile('index.html')
}).catch(startupFailure)
}
}catch(error){startupFailure(error)}
