function createRollCoordinator({local,state,selectedGenre,visibleGenres,genres,pickTerm,pick,
  history,getActiveTrack,getFavouriteChecks,seen,profileURL,save,web,retrieval,queryPlan,sleep,
  runSearch,cancelSimilar,results,remember,isFreeTrack,genreMatches}){
  const pools=new Map()
  const cursors=new Map()
  const {enrich,scan,filteredSearch}=retrieval
  const rollPoolSize=6
  const lowWaterMark=2
  const metadataBatchSize=2
  const rollTimeout=20000
  const queryCheckLimit=8
  const rollCheckLimit=20
  let rollSelection, rollJob, refillTimer

  function prepareSelection(requested,fresh,refresh=false){
    requested=selectedGenre(requested)
    fresh=fresh===true
    if(!refresh&&rollSelection?.requested===requested&&rollSelection.fresh===fresh)return rollSelection
    clearTimeout(refillTimer)
    rollJob?.controller.abort()
    rollJob=null
    rollSelection=null
    const choices=requested==='@favourites'?visibleGenres(state.profile?.genres):[requested]
    const genre=choices[Math.floor(Math.random()*choices.length)]
    if(!Object.hasOwn(genres,genre))return null
    const term=pickTerm(genres[genre],state.ratings,Math.random,state.wildcard/100)
    const key=fresh?term+' / recent':term
    const pool=pools.get(key)||new Map()
    pools.set(key,pool)
    rollSelection={requested,genre,term,key,pool,fresh}
    return rollSelection
  }

  function pruneRollPool(target){
    for(const [url,track] of target.pool){
      if(seen.has(url)||Date.now()-track.preparedAt>30*60000||
          (target.fresh&&Date.now()-track.date.time>365*86400000))target.pool.delete(url)
    }
  }
  function recentUploaders(){
    return new Set([...history.slice(-3),getActiveTrack()].filter(Boolean).map(profileURL))
  }

  function scheduleRefill(target,delay){
    clearTimeout(refillTimer)
    refillTimer=setTimeout(()=>{
      if(rollSelection===target)preparePool(target)
    },delay)
  }

  function refreshRollPreparation(){
    if(rollSelection){
      const {requested,fresh}=rollSelection
      const updated=prepareSelection(requested,fresh,true)
      if(updated)scheduleRefill(updated,300)
    }
  }

  local('prepareRoll',(genre,fresh)=>{
    const target=prepareSelection(genre,fresh)
    if(!target)return
    if(state.discoveryGenre!==target.requested){
      state.discoveryGenre=target.requested
      save()
    }
    scheduleRefill(target,300)
  })

  function preparePool(target,timeLimit=rollTimeout,foreground=false){
    pruneRollPool(target)
    if(getFavouriteChecks()&&!foreground)return null
    if(retrieval.backoffUntil>Date.now())return null
    if(target.pool.size>lowWaterMark)return null
    if(rollJob?.target===target&&!rollJob.controller.signal.aborted){
      if(foreground)rollJob.promote()
      return rollJob
    }
    const controller=new AbortController()
    const {signal}=controller
    const stats={loading:0,extracting:0,waitingForRows:0,metadata:0,filtering:0,searchFailures:0,
      empty:0,unreadable:0,network:0,invalidMetadata:0,duration:0,genre:0,download:0,date:0,accepted:0,queried:[]}
    const job={target,controller,stats,started:Date.now()}
    let pauseUntil=0, resume
    job.pause=()=>{pauseUntil=Date.now()+1800}
    job.promote=()=>{pauseUntil=0;resume?.()}
    const waitForPriority=async()=>{
      if(pauseUntil>Date.now())await new Promise(resolve=>{
        const timer=setTimeout(()=>resume(),pauseUntil-Date.now())
        resume=()=>{
          clearTimeout(timer)
          resume=null
          resolve()
        }
      })
      signal.throwIfAborted()
    }
    let window
    const waiters=new Set()
    const wake=()=>{for(const resolve of waiters)resolve();waiters.clear()}
    job.waitForTrack=()=>signal.aborted?Promise.resolve():new Promise(resolve=>waiters.add(resolve))
    rollJob=job
    const stop=()=>{
      job.promote()
      if(window&&!window.isDestroyed())window.destroy()
      wake()
    }
    signal.addEventListener('abort',stop,{once:true})
    const timer=setTimeout(()=>controller.abort(Error('SoundCloud discovery timed out. Try again.')),timeLimit)
    const checked=new Set(),retryNextQuery=new Set(),retried=new Set()
    const visible=new Set(),previouslyShown=new Set()
    let checks=0,queryChecks=0
    const accept=async rows=>{
      const candidates=new Map()
      const recent=recentUploaders()
      const uploaderCounts=new Map()
      for(const track of target.pool.values()){
        const uploader=profileURL(track)
        uploaderCounts.set(uploader,(uploaderCounts.get(uploader)||0)+1)
      }
      for(const row of rows){
        visible.add(row.url)
        if(seen.has(row.url)){previouslyShown.add(row.url);continue}
        if(checked.has(row.url)||target.pool.has(row.url)||uploaderCounts.get(profileURL(row))>=2)continue
        candidates.set(row.url,{...row,term:target.term,genre:target.genre})
      }
      const relevance=track=>4*Number(isFreeTrack(track))+2*Number(genreMatches(track,target.genre))+
        Number(!recent.has(profileURL(track)))
      const sorted=[...candidates.values()].map(track=>({track,score:relevance(track)}))
        .sort((a,b)=>b.score-a.score).map(item=>item.track)
      for(let start=0;start<sorted.length&&queryChecks<queryCheckLimit&&checks<rollCheckLimit;start+=metadataBatchSize){
        await waitForPriority()
        const batch=sorted.slice(start,start+Math.min(metadataBatchSize,queryCheckLimit-queryChecks,rollCheckLimit-checks))
        checks+=batch.length
        queryChecks+=batch.length
        const began=performance.now()
        const earlierFiltering=stats.filtering
        await Promise.all(batch.map(async candidate=>{
          checked.add(candidate.url)
          let failure
          const track=await enrich(candidate,signal,reason=>{
            failure=reason
            const key=reason==='metadata'?'invalidMetadata':reason
            stats[key]=(stats[key]||0)+1
          })
          if(!track){
            if(failure==='network'&&!retried.has(candidate.url)){
              retried.add(candidate.url)
              retryNextQuery.add(candidate.url)
            }
            return
          }
          if(signal.aborted||rollSelection!==target||seen.has(track.url))return
          const filtering=performance.now()
          try{
            if(!genreMatches(track,target.genre)){stats.genre++;return}
            if(!isFreeTrack(track)){stats.download++;return}
            if(target.fresh&&(!track.date||Date.now()-track.date.time>365*86400000)){stats.date++;return}
            const uploader=profileURL(track)
            const duplicates=[...target.pool.values()].filter(t=>profileURL(t)===uploader).length
            if(target.pool.size>=rollPoolSize||duplicates>=2)return
            target.pool.set(track.url,{...track,preparedAt:Date.now()})
            stats.accepted++
            wake()
          }finally{stats.filtering+=performance.now()-filtering}
        }))
        stats.metadata+=performance.now()-began-(stats.filtering-earlierFiltering)
        if(target.pool.size>=rollPoolSize)return true
      }
      return queryChecks>=queryCheckLimit||checks>=rollCheckLimit
    }
    job.done=(async()=>{
      const queries=queryPlan(target.term,state.profile?.artists||[],target.genre)
      let cursor=cursors.get(target.key)||0
      for(let i=0;i<Math.min(3,queries.length)&&checks<rollCheckLimit&&target.pool.size<rollPoolSize;i++){
        await waitForPriority()
        if(retrieval.backoffUntil>Date.now())break
        const {query,tag,medium}=queries[cursor++%queries.length]
        cursors.set(target.key,cursor)
        const attempt={query,tag,medium,checked:0}
        stats.queried.push(attempt)
        queryChecks=0
        if(!window||window.isDestroyed())window=web(false,true)
        await scan(filteredSearch({query,tag,medium},target.fresh),accept,window,signal,stats)
        attempt.checked=queryChecks
        for(const url of retryNextQuery)checked.delete(url)
        retryNextQuery.clear()
        if(i<2&&target.pool.size<rollPoolSize)await sleep(220)
      }
    })().catch(error=>{
      if(!signal.aborted){stats.searchFailures++;stats.error=error.message}
    }).finally(()=>{
      clearTimeout(timer)
      signal.removeEventListener('abort',stop)
      if(rollJob===job)rollJob=null
      stats.visible=visible.size
      stats.previouslyShown=previouslyShown.size
      stop()
      if(process.env.ROLL_DICE_DIAGNOSTICS==='1')console.info('Roll discovery',JSON.stringify({...stats,checks,requestedGenre:target.genre,aborted:signal.aborted}))
    })
    return job
  }

  function pickPrepared(target){
    pruneRollPool(target)
    if(!target.pool.size)return null
    let eligible=[...target.pool.values()]
    const lastUploaders=recentUploaders()
    const varied=eligible.filter(track=>!lastUploaders.has(profileURL(track)))
    if(varied.length)eligible=varied
    if(target.fresh){
      eligible.sort((a,b)=>b.date.time-a.date.time)
      eligible=eligible.slice(0,Math.max(1,Math.ceil(eligible.length/3)))
    }
    const url=pick(eligible.map(track=>track.url),[],state.ratings,Math.random,state.wildcard/100,
      state.profile?.artists||[],target.pool,Object.keys(state.artistFavourites))
    return target.pool.get(url)
  }

  local('roll',(genre,fresh)=>runSearch(async()=>{
    cancelSimilar()
    results.clear()
    const target=prepareSelection(genre,fresh)
    if(!target)throw Error('Choose a genre first.')
    const start=performance.now()
    const clicked=Date.now()
    let track=pickPrepared(target)
    const prepared=!!track
    if(!track){
      let job=preparePool(target,rollTimeout,true)
      await job?.waitForTrack()
      if(rollSelection!==target)throw Error('Discovery selection changed.')
      track=pickPrepared(target)
      const remaining=rollTimeout-(Date.now()-clicked)
      if(!track&&job?.controller.signal.aborted&&job.started<clicked&&remaining>=6500){
        job=preparePool(target,remaining,true)
        await job?.waitForTrack()
        if(rollSelection!==target)throw Error('Discovery selection changed.')
        track=pickPrepared(target)
      }
      if(!track){
        const stats=job?.stats
        if(retrieval.backoffUntil>Date.now())throw Error('SoundCloud is limiting requests. Try again after a short pause.')
        if(job?.controller.signal.aborted)throw Error('SoundCloud discovery timed out. Try again.')
        if(stats?.searchFailures){
          throw Error('SoundCloud did not finish loading the search. Try again.')
        }
        if(stats?.unreadable){
          throw Error('SoundCloud loaded without readable track listings. Try again.')
        }
        if(stats?.network||stats?.invalidMetadata)throw Error('Some SoundCloud track details could not be verified. Try again.')
        if(stats?.visible&&stats.visible===stats.previouslyShown)throw Error('The search returned tracks you have already seen. Retry uses other SoundCloud searches.')
        throw Error(target.fresh?'These searches found no recent tracks in '+target.genre+' with a free download and a verified duration of 10 minutes or less. Try Retry roll or turn off Fresh tunes.':
          'These searches found no new '+target.genre+' tracks with a free download and a verified duration of 10 minutes or less. Retry roll searches other listings.')
      }
    }
    const selecting=performance.now()
    const {preparedAt,...recommendation}=track
    const result=remember(recommendation)
    target.pool.delete(track.url)
    const next=genre==='@favourites'?prepareSelection(genre,fresh,true):target
    if(next){
      if(rollJob?.target===next)rollJob.pause()
      scheduleRefill(next,1800)
    }
    if(process.env.ROLL_DICE_DIAGNOSTICS==='1')console.info('Roll selection',JSON.stringify({
      genre:target.genre,prepared,waiting:selecting-start,selecting:performance.now()-selecting}))
    return result
  }))

  function pauseForFavourites(){
    clearTimeout(refillTimer)
    rollJob?.controller.abort()
  }
  return {refreshRollPreparation,pruneRollPool,preparePool,scheduleRefill,rollTimeout,pauseForFavourites,
    get selection(){return rollSelection}}
}
module.exports=createRollCoordinator
