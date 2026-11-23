function createFavouriteUploads({local,state,getActiveTrack,isSearching,profileURL,saveEntry,
  refreshRollPreparation,roll,ui,music,web,retrieval,genres,similarDiagnostics,duplicateUpload,
  soundCloudProfile,verifiedUpload,byUploadDate,favouriteStatus,mergeFavouriteCheck,publicProfileUploads,durationIssue}){
  const {respectBackoff,getTrackMetadata,mergeTrackMetadata,scan,enrich}=retrieval
  const favouriteList=()=>Object.values(state.artistFavourites)
  local('artistFavourites',favouriteList)
  local('toggleFavourite',url=>{
    if(isSearching()||url!==getActiveTrack()?.url)throw Error('Choose a current track.')
    const profile=profileURL(getActiveTrack())
    if(!profile)throw Error('SoundCloud uploader profile unavailable.')
    saveEntry(state.artistFavourites,profile,state.artistFavourites[profile]?undefined:
      {profile,name:getActiveTrack().artist||profile.split('/').pop()})
    if(!state.artistFavourites[profile])discardUploads(profile)
    refreshRollPreparation()
    return favouriteList()
  })
  local('removeFavourite',profile=>{
    if(Object.hasOwn(state.artistFavourites,profile)){
      saveEntry(state.artistFavourites,profile)
      discardUploads(profile)
      refreshRollPreparation()
    }
    return favouriteList()
  })
  const uploads=new Map()
  let feed=new Map(), favouriteChecks=0
  function discardUploads(profile){
    uploads.get(profile)?.controller?.abort()
    uploads.delete(profile)
    for(const [url,track] of feed)if(track.favouriteProfile===profile)feed.delete(url)
  }
  function profileUploads(favourite,refresh,onProgress){
    const key=favourite.profile, profile=soundCloudProfile(key)
    const previous=uploads.get(key)||{rows:[]}
    if(previous.pending)return previous.pending
    if(previous.checkedAt&&Date.now()-previous.checkedAt<(refresh?5000:
      previous.status==='ready'||previous.status==='empty'?10*60000:45000))return previous
    if(!profile){
      const broken={rows:[],status:'identity',checkedAt:Date.now()}
      uploads.set(key,broken)
      return broken
    }
    const controller=new AbortController(), signal=AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])
    const entry={...previous,controller}
    entry.pending=(async()=>{
      const started=performance.now()
      let window, found=new Map()
      const rows=[]
      const stats=similarDiagnostics()
      const stop=()=>{if(window&&!window.isDestroyed())window.destroy()}
      signal.addEventListener('abort',stop,{once:true})
      const eligible=track=>{
        const verified=verifiedUpload(track,profile,Object.keys(genres))
        return verified&&{...verified,artist:verified.artist||favourite.name,favouriteProfile:key}
      }
      try{
        const address=profile+'/tracks'
        let published
        try{
          const response=await music.fetch(address,{redirect:'error',
            signal:AbortSignal.any([signal,AbortSignal.timeout(6500)])})
          if(response.status===429)respectBackoff(response.headers.get('retry-after'))
          if(response.ok)published=publicProfileUploads(await response.text(),profile)
          else{
            stats.profileDocument='HTTP '+response.status
            if(response.status===429||response.status>=500)stats.searchFailures++
          }
        }catch(error){stats.profileDocument=error.code||error.message}
        if(published?.length){
          stats.source='public profile document'
          for(const track of published)found.set(track.url,track)
          const candidates=[...found.values()].sort((a,b)=>(b.publishedAt||0)-(a.publishedAt||0)).slice(0,8)
          for(const candidate of candidates){
            if(candidate.publicDuration>=600000||!candidate.publicDuration)continue
            const verified=eligible({...candidate,duration:candidate.publicDuration})
            if(verified)rows.push(verified)
          }
          if(rows.length){
            entry.rows=[...rows]
            onProgress?.()
          }
          for(const candidate of candidates){
            if(signal.aborted)break
            if(candidate.publicDuration>600000){stats.duration++;continue}
            const index=rows.findIndex(track=>track.url===candidate.url)
            let metadata
            try{metadata=await getTrackMetadata(candidate.url,signal,4500)}
            catch(error){
              stats.lastMetadataError=error.code||error.message
              if(index<0)stats.network++
              else stats.optionalDetailsMissing=(stats.optionalDetailsMissing||0)+1
              continue
            }
            if(!metadata){
              if(index<0)stats.metadata++
              continue
            }
            const verified=eligible(mergeTrackMetadata(candidate,metadata))
            if(verified){
              if(index<0)rows.push(verified)
              else rows[index]=verified
            }else{
              if(index>=0)rows.splice(index,1)
              const issue=durationIssue(metadata.duration)
              if(issue)stats[issue]++
            }
          }
        }else if(retrieval.backoffUntil>Date.now()||stats.searchFailures)stats.searchFailures=Math.max(1,stats.searchFailures)
        else{
          stats.source='profile browser'
          window=web(false,true)
          await scan(address,page=>{
            for(const row of page){
              if(soundCloudProfile(profileURL(row))===profile&&!found.has(row.url))found.set(row.url,row)
            }
            return found.size>=8
          },window,signal,stats,{profile,pages:3})
          const candidates=[...found.values()].sort((a,b)=>(Date.parse(b.uploaded)||0)-(Date.parse(a.uploaded)||0)).slice(0,8)
          for(const candidate of candidates){
            if(signal.aborted){stats.searchFailures++;break}
            const track=await enrich(candidate,signal,(reason,detail)=>{
              stats[reason]++
              if(detail)stats.lastMetadataError=detail
            },6500)
            const verified=eligible(track)
            if(verified)rows.push(verified)
          }
        }
      }finally{
        signal.removeEventListener('abort',stop)
        stop()
      }
      if(controller.signal.aborted)return previous
      const status=favouriteStatus({found:found.size,accepted:rows.length,network:stats.searchFailures+stats.network,
        unreadable:stats.unreadable,metadata:stats.metadata+stats.unverifiedDuration,timeout:signal.aborted,
        identity:stats.identity,empty:stats.empty})
      if(process.env.ROLL_DICE_DIAGNOSTICS==='1')console.info('Favourite uploads',JSON.stringify({
        profile,status,found:found.size,accepted:rows.length,ms:performance.now()-started,stats}))
      return mergeFavouriteCheck(previous,{rows:rows.sort(byUploadDate),status},Date.now())
    })().catch(()=>mergeFavouriteCheck(previous,{rows:[],status:'network'},Date.now())).then(result=>{
      if(uploads.get(key)===entry)uploads.set(key,result)
      return result
    })
    uploads.set(key,entry)
    return entry.pending
  }
  function favouriteSnapshot(){
    const current=favouriteList().map(fav=>({fav,cache:uploads.get(fav.profile)}))
    const rows=[]
    for(const track of current.flatMap(({cache})=>cache?.rows||[]).sort(byUploadDate)){
      if(!rows.some(row=>duplicateUpload(row,track)))rows.push(track)
      if(rows.length===30)break
    }
    feed=new Map(rows.map(t=>[t.url,t]))
    const artists=current.filter(({cache})=>cache?.checkedAt).map(({fav,cache})=>({
      name:fav.name,profile:fav.profile,status:cache.status,checkedAt:cache.checkedAt,rowCount:cache.rows.length
    }))
    return {rows,artists,checkedAt:Math.max(0,...artists.map(artist=>artist.checkedAt))}
  }
  local('favouriteUploads',async(refresh=false,onlyProfile,requestId)=>{
    const selected=favouriteList().filter(fav=>!onlyProfile||fav.profile===onlyProfile)
    favouriteChecks++
    if(!isSearching()){
      roll.pauseForFavourites()
    }
    const publish=()=>{
      if(Number.isInteger(requestId)&&!ui.isDestroyed())ui.webContents.send('favouriteUpdates',requestId,favouriteSnapshot())
    }
    try{
      for(const favourite of selected){
        if(!state.artistFavourites[favourite.profile])continue
        await profileUploads(favourite,refresh===true,publish)
        publish()
      }
      return favouriteSnapshot()
    }finally{
      if(!--favouriteChecks&&roll.selection)roll.scheduleRefill(roll.selection,1800)
    }
  })
  return {get feed(){return feed},get checks(){return favouriteChecks}}
}
module.exports=createFavouriteUploads
