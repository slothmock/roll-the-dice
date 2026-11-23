function createDiscoveryRetrieval({music,trackMetadata,trackURL,deadline,readRows,sleep}){
  const metadata=new Map()
  const metadataRequests=new Map()
  let discoveryBackoff=0
  function respectBackoff(retry){
    const seconds=retry==null?30:Number(retry)
    const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()
    discoveryBackoff=Math.max(discoveryBackoff,Date.now()+Math.max(5000,Number.isFinite(delay)?delay:30000))
  }
  async function getTrackMetadata(url,signal,timeout=4500){
    signal?.throwIfAborted()
    const cached=metadata.get(url)
    if(cached?.expires>Date.now())return cached.data
    if(discoveryBackoff>Date.now())throw Error('SoundCloud requested a pause.')
    let request=metadataRequests.get(url)
    if(!request||request.controller.signal.aborted){
      const controller=new AbortController()
      request={controller,clients:0}
      const current=request
      request.promise=(async()=>{
        const response=await music.fetch(url,{redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)])})
        if(response.status===429)respectBackoff(response.headers.get('retry-after'))
        if(!response.ok)throw Error('SoundCloud metadata HTTP '+response.status)
        const data=trackMetadata(await response.text(),url)
        controller.signal.throwIfAborted()
        if(data&&Number.isFinite(data.duration)&&data.duration>0){
          if(metadata.size>=512)metadata.delete(metadata.keys().next().value)
          metadata.set(url,{data,expires:Date.now()+30*60000})
        }
        return data
      })().finally(()=>{if(metadataRequests.get(url)===current)metadataRequests.delete(url)})
      metadataRequests.set(url,request)
    }
    request.clients++
    let stop
    try{
      if(!signal)return await request.promise
      return await Promise.race([request.promise,new Promise((_,reject)=>{
        stop=()=>reject(signal.reason)
        signal.addEventListener('abort',stop,{once:true})
      })])
    }finally{
      if(stop)signal.removeEventListener('abort',stop)
      if(!--request.clients&&metadataRequests.get(url)===request)request.controller.abort()
    }
  }
  async function enrich(track,signal,rejectReason=()=>{},timeout){
    if(track.duration>0&&track.duration<=600000)return track
    let data
    try{data=await getTrackMetadata(track.url,signal,timeout)}catch(error){
      if(!signal?.aborted)rejectReason('network',error.code||error.message)
      return null
    }
    if(!data){rejectReason('metadata');return null}
    if(!Number.isFinite(data.duration)||data.duration<=0){rejectReason('unverifiedDuration');return null}
    if(data.duration>600000){rejectReason('duration');return null}
    return mergeTrackMetadata(track,data)
  }
  function mergeTrackMetadata(track,data){
    const uploaded=Date.parse(track.uploaded)
    return {...track,...data,artist:data.artist||track.artist,
      tags:[track.tags,data.tags].filter(Boolean).join(' '),
      links:[...new Set([...(track.links||[]),...data.links])],
      actions:[...(track.actions||[]),...data.links.map(url=>({url,label:data.purchaseTitle||''}))],
      date:data.date||(uploaded>0&&uploaded<=Date.now()?{time:uploaded,label:'Uploaded'}:null)}
  }
  async function scan(url,accept,window,signal,diagnostics,{related=false,pages=6,profile=''}={}){
    const wc=window.webContents
    const execute=source=>signal?wc.mainFrame.executeJavaScript(source):wc.executeJavaScript(source)
    let ready
    let responseCode
    let phase='retrieval'
    const reachedPage=(_event,_url,code)=>{responseCode=code}
    if(diagnostics)wc.on('did-navigate',reachedPage)
    try{
      const started=performance.now()
      const dom=signal?new Promise(resolve=>{ready=resolve;wc.once('dom-ready',ready)}):null
      const navigation=window.loadURL(url)
      try{await deadline(dom?Promise.race([navigation,dom]):navigation,profile?12000:diagnostics?8000:12000)}
      finally{if(diagnostics)diagnostics.loading+=performance.now()-started}
      if(diagnostics&&responseCode>=400){
        if(responseCode===429)respectBackoff()
        diagnostics.searchFailures++
        diagnostics.lastSearchError='HTTP '+responseCode
        return false
      }
      if(profile){
        const loaded=new URL(wc.getURL())
        if(loaded.pathname.replace(/\/$/,'').toLowerCase()!==new URL(profile+'/tracks').pathname||
          loaded.origin!=='https://soundcloud.com'){
          diagnostics.identity=true
          return false
        }
      }
      phase='extraction'
      const rowScript='('+readRows.toString()+')('+related+')'
      async function read(){
        signal?.throwIfAborted()
        const started=performance.now()
        try{
          const rows=await deadline(execute(rowScript),3000)
          return rows.map(row=>({...row,url:trackURL(row.url)})).filter(row=>row.url)
        }finally{if(diagnostics)diagnostics.extracting+=performance.now()-started}
      }
      let rows=await read()
      if(signal){
        // The page shell fires dom-ready before SoundCloud fetches its search rows.
        const readyUntil=Date.now()+(profile?6500:related?1800:diagnostics?4000:5500)
        while(!rows.length&&Date.now()<readyUntil){
          const waiting=performance.now()
          await sleep(400)
          if(diagnostics)diagnostics.waitingForRows+=performance.now()-waiting
          signal.throwIfAborted()
          rows=await read()
        }
        if(!rows.length){
          if(diagnostics){
            const text=await deadline(execute('document.body?.innerText.slice(0,2500)||""'),1500)
            if(/\b(?:no (?:search )?results(?: found)?|couldn.t find any (?:tracks|results))\b/i.test(text)||
              profile&&/\b(?:hasn.t uploaded any tracks|no tracks (?:yet|found)|has no tracks|no public tracks)\b/i.test(text))diagnostics.empty++
            else diagnostics.unreadable++
          }
          return true
        }
      }
      for(let page=0;page<pages;page++){
        signal?.throwIfAborted()
        if(await accept(rows)){
          window.hide()
          break
        }
        if(page===pages-1)break
        await deadline(execute('window.scrollBy(0,Math.max(innerHeight,900))'),3000)
        await sleep(450)
        rows=await read()
      }
      return true
    }catch(error){
      const recoverable=error.code==='SEARCH_TIMEOUT'||/^ERR_(?:ABORTED|TIMED_OUT|CONNECTION_.*|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED)$/.test(error.code)
      if(!window.isDestroyed())window.destroy()
      if(signal?.aborted)return false
      if(diagnostics){
        if(phase==='extraction')diagnostics.unreadable++
        else diagnostics.searchFailures++
        diagnostics.lastSearchError=error.code||error.message
        return false
      }
      if(!recoverable)throw error
      return false
    }finally{
      if(!wc.isDestroyed()){
        if(ready)wc.removeListener('dom-ready',ready)
        if(diagnostics)wc.removeListener('did-navigate',reachedPage)
      }
    }
  }
  const searchURL=query=>'https://soundcloud.com/search/sounds?q='+encodeURIComponent(query)
  function filteredSearch({query,tag,medium},fresh=false){
    const page=new URL(searchURL(query))
    if(tag)page.searchParams.set('filter.genre_or_tag',tag)
    if(medium)page.searchParams.set('filter.duration','medium')
    if(fresh)page.searchParams.set('filter.created_at','last_year')
    return page.href
  }
  return {getTrackMetadata,enrich,mergeTrackMetadata,scan,filteredSearch,respectBackoff,
    get backoffUntil(){return discoveryBackoff}}
}
module.exports=createDiscoveryRetrieval
