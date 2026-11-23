function createSimilaritySearch({local,friendsBeta,state,getActiveTrack,getPlaybackRevision,isSearching,
  results,getFeed,ui,music,web,retrieval,genres,keyEvidence,styleEvidence,trackIdentity,duplicateUpload,
  durationIssue,describeRecommendation,rankEvidence,selectSimilar,listedTrackKey,trackURL,similarGenreMatches,
  seedSearchPlan,isTuneListing,profileURL,soundCloudProfile,publicProfileUploads,remember}){
  const {getTrackMetadata,mergeTrackMetadata,filteredSearch,enrich,scan,respectBackoff}=retrieval
  let similarJob
  function cancelSimilar(requestId){
    if(!similarJob||(requestId!==undefined&&similarJob.id!==requestId))return
    similarJob.controller.abort()
    similarJob=null
  }
  const similarCache=new Map()
  function trackKeys(track){
    return keyEvidence({audio:state.playbackKeys?.[track.url],imported:state.estimatedKeys?.[track.url],listed:listedTrackKey(track)})
  }
  function cachedSimilar(key){
    const now=Date.now()
    const cached=similarCache.get(key)
    if(cached?.expires>now){
      similarCache.delete(key)
      similarCache.set(key,cached)
      return cached
    }
    if(cached)similarCache.delete(key)
    if(similarCache.size>=48)similarCache.delete(similarCache.keys().next().value)
    const entry={expires:now+5*60000,tracks:new Map(),attempts:new Map(),related:new Set()}
    similarCache.set(key,entry)
    return entry
  }
  function similarDiagnostics(){
    return {loading:0,extracting:0,waitingForRows:0,searchFailures:0,empty:0,unreadable:0,
      network:0,metadata:0,genre:0,duration:0,unverifiedDuration:0,seed:0,duplicates:0,queried:[]}
  }
  if(!friendsBeta)local('similar',async(url,style,revision,requestId,more=false,strict=false)=>{
    const canonical=trackURL(url)
    if(isSearching()||!canonical||canonical!==trackURL(getActiveTrack()?.url)||revision!==getPlaybackRevision())
      throw Error('The track changed. Try again.')
    if(!Object.hasOwn(genres,style))throw Error('Choose a DJ subgenre.')
    cancelSimilar()
    const job={id:requestId,controller:new AbortController()}
    const {signal}=job.controller
    similarJob=job
    const windows=new Set(), checked=new Set(), observed=new Set()
    const stats=similarDiagnostics(), started=performance.now()
    const active=()=>similarJob===job&&getPlaybackRevision()===revision&&!ui.isDestroyed()
    const stop=()=>{for(const window of windows)if(!window.isDestroyed())window.destroy()}
    signal.addEventListener('abort',stop,{once:true})
    let seed={...getActiveTrack(),url:canonical}, rows=[], entry, plans=[], relatedPlan, timedOut=false, checks=0
    const timer=setTimeout(()=>{timedOut=true;job.controller.abort()},19000)
    const limit=26
    const queryKey=plan=>plan.url
    const available=plan=>Boolean(plan)&&(entry?.attempts.get(queryKey(plan))||0)<2
    try{
      // Some tracks lack the metadata that makes a query specific to the seed.
      if(!seed.trackId||![seed.listedGenre,seed.listedTags,seed.creditedArtist,seed.labelName].some(Boolean)){
        try{
          const data=await getTrackMetadata(canonical,signal,2700)
          if(data)seed=mergeTrackMetadata(seed,data)
        }catch{if(!signal.aborted)stats.seedMetadataUnavailable=true}
      }
      signal.throwIfAborted()
      seed={...seed,title:seed.listedTitle||seed.title,profile:profileURL(seed),keyEvidence:trackKeys(seed)}
      const exactKey=strict&&seed.keyEvidence.key||''
      plans=seedSearchPlan(seed,style,genres[style][0],exactKey).map(plan=>({...plan,url:filteredSearch(plan)}))
      relatedPlan={source:'related',url:canonical}
      const key=JSON.stringify([canonical,trackIdentity(seed),style,exactKey,plans.map(queryKey)])
      entry=cachedSimilar(key)
      stats.cacheRows=entry.tracks.size
      const context={sameStyle:similarGenreMatches(seed,style),favourites:Object.keys(state.artistFavourites),
        ratings:state.ratings,artists:state.profile?.artists||[]}
      const describe=track=>describeRecommendation(seed,{...track,title:track.listedTitle||track.title,
        profile:profileURL(track),genre:style,term:genres[style][0]},
      {...context,related:entry.related.has(track.url),keys:trackKeys(track)})
      function publish(){
        rows=[...entry.tracks.values()].map(describe).sort(rankEvidence).slice(0,48)
        if(active()&&!signal.aborted){
          for(const track of rows)results.set(track.url,track)
          ui.webContents.send('similarResults',{id:requestId,url:canonical,revision,style},rows)
        }
      }
      function addVerified(track){
        if(!active()||signal.aborted)return
        if(duplicateUpload(seed,track)){stats.seed++;return}
        const duration=durationIssue(track.duration)
        if(duration){stats[duration]++;return}
        if(track.playable===false){stats.unplayable=(stats.unplayable||0)+1;return}
        if(!isTuneListing(track)){stats.notTune=(stats.notTune||0)+1;return}
        if(!similarGenreMatches(track,style)){stats.genre++;return}
        if([...entry.tracks.values()].some(item=>item.url!==track.url&&duplicateUpload(item,track))){
          stats.duplicates++;return
        }
        if(entry.tracks.size>=64&&!entry.tracks.has(track.url)){
          const worst=[...entry.tracks.values()].map(describe).sort(rankEvidence).at(-1)
          if(rankEvidence(describe(track),worst)>=0)return
          entry.tracks.delete(worst.url)
        }
        entry.tracks.set(track.url,track)
      }
      for(const track of getFeed().values()){
        if(!entry.tracks.has(track.url)&&describe(track).seedScore>0&&similarGenreMatches(track,style))addVerified(track)
      }
      if(entry.tracks.size)publish()

      const seedTags=styleEvidence(seed)
      async function collect(listings,query,{isRelated=false,allowance,parallel}){
        let relatedChanged=false
        const pending=new Map()
        for(const row of listings){
          if(row.url===canonical){stats.seed++;continue}
          observed.add(row.url)
          if(isRelated&&!entry.related.has(row.url)){
            entry.related.add(row.url)
            relatedChanged=true
          }
          if(row.publicDuration>600000){stats.duration++;continue}
          if(!isTuneListing(row)){stats.notTune=(stats.notTune||0)+1;continue}
          if(!checked.has(row.url)&&!entry.tracks.has(row.url))pending.set(row.url,row)
        }
        if(relatedChanged&&entry.tracks.size)publish()
        query.retrieved+=listings.length
        const priority=row=>3*Number(similarGenreMatches(row,style))+
          Number(profileURL(row)===seed.profile)+styleEvidence(row).filter(tag=>seedTags.includes(tag)).length
        const pendingRows=[...pending.values()].map(row=>({row,priority:priority(row)}))
          .sort((first,second)=>second.priority-first.priority).slice(0,allowance)
        for(let index=0;index<pendingRows.length;index+=parallel){
          if(signal.aborted||checks>=limit)return
          const batch=pendingRows.slice(index,index+parallel)
            .filter(({row})=>!checked.has(row.url)&&!entry.tracks.has(row.url)).slice(0,limit-checks)
          checks+=batch.length
          query.checked+=batch.length
          for(const {row} of batch)checked.add(row.url)
          await Promise.all(batch.map(async({row})=>{
            const full=await enrich(row,signal,reason=>{stats[reason]++})
            if(full)addVerified(full)
          }))
          if(batch.length&&active()&&!signal.aborted)publish()
        }
      }

      async function browse(plan,allowance,parallel){
        if(!available(plan)||signal.aborted||checks>=limit)return
        if(retrieval.backoffUntil>Date.now()){stats.searchFailures++;return}
        const isRelated=plan.source==='related'
        const isUploader=plan.source==='uploader'
        const sourceStats=similarDiagnostics()
        const query={...plan,retrieved:0,checked:0}
        const started=performance.now()
        stats.queried.push(query)
        let window
        try{
          const options={isRelated,allowance,parallel}
          if(isUploader){
            try{
              const response=await music.fetch(plan.url,{redirect:'error',
                signal:AbortSignal.any([signal,AbortSignal.timeout(3500)])})
              if(response.status===429)respectBackoff(response.headers.get('retry-after'))
              if(!response.ok)throw Error('HTTP '+response.status)
              const listings=publicProfileUploads(await response.text(),plan.profile)
              if(!listings)sourceStats.unreadable++
              else if(!listings.length)sourceStats.empty++
              else await collect(listings,query,options)
            }catch(error){
              if(!signal.aborted){sourceStats.searchFailures++;sourceStats.lastSearchError=error.message}
            }
          }else{
            window=web(false,true)
            windows.add(window)
            await scan(plan.url,async listings=>{
              await collect(listings,query,options)
              return true
            },window,signal,sourceStats,{related:isRelated,pages:1})
          }
          if(active()&&!signal.aborted){
            const attempts=entry.attempts.get(queryKey(plan))||0
            const success=query.retrieved>0||sourceStats.empty>0
            entry.attempts.set(queryKey(plan),success?2:attempts+1)
          }
        }finally{
          for(const field of ['loading','extracting','waitingForRows'])stats[field]+=sourceStats[field]
          if(!isRelated&&!isUploader){
            for(const field of ['searchFailures','empty','unreadable'])stats[field]+=sourceStats[field]
          }
          query.status=signal.aborted?'cancelled':query.retrieved?'rows':sourceStats.searchFailures?'network':
            sourceStats.empty?'empty':'unreadable'
          query.ms=Math.round(performance.now()-started)
          if(sourceStats.lastSearchError)query.error=sourceStats.lastSearchError
          if(window&&!window.isDestroyed())window.destroy()
          windows.delete(window)
        }
      }

      // Reopening a completed search can reuse its verified candidates. Continuing searches new branches.
      if(more||!entry.attempts.size||!rows.length){
        const profile=soundCloudProfile(seed.profile)
        const uploader=profile?{source:'uploader',profile,url:profile+'/tracks'}:null
        async function searchListings(){
          const eligible=plans.filter(available)
            .sort((first,second)=>Number(entry.attempts.has(queryKey(first)))-Number(entry.attempts.has(queryKey(second))))
          const first=eligible[0]
          await browse(first,8,2)
          if(signal.aborted)return
          const remaining=eligible.filter(plan=>plan!==first&&available(plan))
          const matches=()=>selectSimilar(rows,{seed,sameKeyOnly:!!exactKey})
          const fallback=more?null:remaining.find(plan=>plan.source==='subgenre')
          const followedEarly=!matches().length&&!!fallback
          // When the first seed query produces no eligible rows, let the fallback run before the next branch.
          if(followedEarly)await browse(fallback,7,2)
          const followup=remaining.find(plan=>plan!==fallback&&plan.source!=='subgenre'&&plan.source!==first?.source)||
            remaining.find(plan=>plan!==fallback)
          if(more||matches().filter(track=>track.seedScore>0).length<8)await browse(followup,6,2)
          if(!followedEarly&&matches().length<5)await browse(fallback,7,2)
        }
        await Promise.all([browse(relatedPlan,5,1),browse(uploader,4,1),searchListings()])
      }
    }catch(error){
      if(!signal.aborted)throw error
    }finally{
      clearTimeout(timer)
      signal.removeEventListener('abort',stop)
      stop()
      if(similarJob===job)similarJob=null
    }
    const status=signal.aborted?(timedOut?'timeout':'cancelled'):rows.length?'ready':
      stats.searchFailures||stats.network?'network':stats.unreadable||stats.metadata?'parse':observed.size?'filtered':'empty'
    const diagnostics={...stats,retrieved:observed.size,checks,totalMs:performance.now()-started}
    if(process.env.ROLL_DICE_DIAGNOSTICS==='1')console.info('Similar discovery',JSON.stringify({seed:canonical,style,status,diagnostics}))
    return {rows,status,diagnostics,hasMore:!!entry&&plans.some(available)}
  })
  if(!friendsBeta)local('listenMatch',url=>{
    if(isSearching()||!results.has(url))throw Error('Choose a current result.')
    return remember(results.get(url))
  })
  return {cancelSimilar,similarDiagnostics}
}
module.exports=createSimilaritySearch
