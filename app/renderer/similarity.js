function initializeSimilarityUI({el,action,dice,friendsBeta,getCurrent,isBusy,similarStyles,trackRow,
  estimate,openPlayback,capturePlayback,captureSeconds,earlyCheckSeconds,captureFailure,widgetRequest,playerTrackURL,
  keyEvidence,keySourceLabels,sameKeyIssue,similarTrackURL,trackIdentity,rankEvidence,selectSimilar}){
  function keyLabel(key){
    const wheel=[5,12,7,2,9,4,11,6,1,8,3,10]
    const notes=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B']
    const major=key.endsWith('B')
    const index=wheel.indexOf(Number(key.slice(0,-1)))
    return notes[(index+(major?3:0))%12]+(major?' major':' minor')+' · '+key
  }
  function paintKey(){
    el('trackKey').textContent=[
      getCurrent().playbackKey&&'Audio-detected estimate: '+keyLabel(getCurrent().playbackKey),
      getCurrent().publishedKey&&'Uploader-listed key: '+keyLabel(getCurrent().publishedKey),
      getCurrent().estimatedKey&&'Imported audio estimate: '+keyLabel(getCurrent().estimatedKey)
    ].filter(Boolean).join(' | ')
  }
  let preparation
  let preparationId=0
  let waitTimer

  function armCapture(){
    const controller=new AbortController()
    // The track-selection gesture supplies the activation required for tab capture.
    const grant=openPlayback(controller.signal).then(audio=>{
      if(controller.signal.aborted)audio.stop()
      else{
        controller.signal.addEventListener('abort',()=>audio.stop(),{once:true})
        return audio
      }
    }).catch(()=>null)
    return {controller,grant}
  }

  function stopListening(job){
    job.arm?.controller.abort()
    job.audio?.stop()
    job.audio=null
  }

  function setPreparation(track,arm){
    const job={track,key:track.playbackKey||'',searches:new Map(),arm:null,listening:false,heard:0}
    preparation=job
    prepareCandidates(job)
    if(job.key){
      arm?.controller.abort()
    }else if(arm)listenInBackground(job,arm)
  }

  async function waitForPlayback(job,signal){
    while(!signal.aborted&&preparation===job){
      const [sound,paused,position]=await Promise.all(
        ['getCurrentSound','isPaused','getPosition'].map(method=>widgetRequest(method,signal)))
      signal.throwIfAborted()
      if(playerTrackURL(sound)===job.track.url&&paused===false&&Number.isFinite(position))return position
      await new Promise(resolve=>setTimeout(resolve,500))
    }
    signal.throwIfAborted()
  }

  function listenInBackground(job,arm){
    if(job.key||job.listening||job.analysisFinished){arm.controller.abort();return}
    job.arm=arm
    job.listening=true
    let analysed=false
    let audioIssue=''
    let played=false
    const signal=AbortSignal.any([arm.controller.signal,AbortSignal.timeout(90000)])
    ;(async()=>{
      try{
        job.audio=await arm.grant
        signal.throwIfAborted()
        if(!job.audio)throw Error(captureFailure)
        const sections=[]
        let reason=''
        while(sections.length<3){
          job.heard=0
          updateSimilar()
          const position=await waitForPlayback(job,signal)
          played=true
          signal.throwIfAborted()
          const started=performance.now()
          let recording
          try{
            recording=await capturePlayback(job.audio,signal,seconds=>{
              job.heard=seconds
              updateSimilar()
            })
          }catch(error){
            if(error.code!=='INSUFFICIENT_AUDIO')throw error
            audioIssue=error.message
            continue
          }
          const [sound,end,estimateResult]=await Promise.all([
            widgetRequest('getCurrentSound',signal),widgetRequest('getPosition',signal),
            recording.earlyResult||estimate(recording.channels,recording.sampleRate,signal,
              recording.channels[0].length<recording.sampleRate*captureSeconds)
          ])
          signal.throwIfAborted()
          if(preparation!==job)return
          if(playerTrackURL(sound)!==job.track.url||!Number.isFinite(end)||
              end-position<earlyCheckSeconds*1000-2000||end-position>performance.now()-started+2500)continue
          analysed=true
          sections.push(estimateResult)
          reason=estimateResult.reason
          if(!estimateResult.key)continue
          const support=sections.filter(result=>result.key===estimateResult.key).length
          const disagreement=sections.filter(result=>{
            const [first,second]=result.diagnostics?.candidates||[]
            return first&&second&&first.key!==estimateResult.key&&first.fit>=0.64&&first.score-second.score>=0.012
          }).length
          const contradictsListing=job.track.publishedKey&&job.track.publishedKey!==estimateResult.key
          if(support<=disagreement||(contradictsListing&&support<2)){reason='disagreement';continue}
          await dice.savePlaybackKey(job.track.url,estimateResult.key,job.track.playbackRevision)
          signal.throwIfAborted()
          if(preparation!==job)return
          job.key=job.track.playbackKey=estimateResult.key
          job.analysisFinished=true
          paintKey()
          updateSimilar()
          return
        }
        job.analysisFinished=true
        job.message=reason==='disagreement'?'No reliable key. The sections heard gave competing key estimates.':
          'No reliable key. The sections heard contained too little tonal evidence.'
      }catch(error){
        if(preparation===job&&!arm.controller.signal.aborted){
          if(!signal.aborted)job.message=error.message
          else if(analysed)job.message='No reliable key was found in the playback heard so far.'
          else job.message=audioIssue||(played?'Playback changed before enough audio was captured.':'Play the SoundCloud preview to analyse its key.')
          job.analysisFinished=signal.aborted&&analysed
        }
      }finally{
        if(job.arm===arm){
          stopListening(job)
          job.listening=false
          updateSimilar()
        }
      }
    })()
  }

  const recentSimilarSeeds=new Map()

  function recentSimilarTracks(seed){
    const id=trackIdentity(seed)
    return new Set([...recentSimilarSeeds].flatMap(([other,rows])=>other===id?[]:rows))
  }

  function rememberSimilarTracks(seed,rows){
    if(!rows.length)return
    const id=trackIdentity(seed)
    recentSimilarSeeds.delete(id)
    recentSimilarSeeds.set(id,rows.map(trackIdentity))
    if(recentSimilarSeeds.size>8)recentSimilarSeeds.delete(recentSimilarSeeds.keys().next().value)
  }

  function isCurrentSimilarSeed(job){
    return !!job&&preparation===job&&job.track.url===getCurrent()?.url&&job.track.playbackRevision===getCurrent().playbackRevision
  }

  function prepareCandidates(job,more=false){
    const style=el('matchStyle').value
    if(!style||!isCurrentSimilarSeed(job))return
    const previous=job.searches.get(style)
    if(previous?.running||previous&&!more)return
    const search={id:++preparationId,style,rows:previous?.rows||[],running:true}
    job.searches.set(style,search)
    const strict=more&&el('sameKeyOnly').checked
    const active=()=>!search.cancelled&&isCurrentSimilarSeed(job)&&job.searches.get(style)===search
    dice.similar(similarTrackURL(job.track.url),style,job.track.playbackRevision,search.id,more,strict).then(result=>{
      if(!active())return
      mergeSimilarRows(search,result.rows)
      search.status=result.status
      search.hasMore=result.hasMore
    },error=>{
      if(active())search.error=error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')
    }).finally(()=>{
      search.running=false
      if(isCurrentSimilarSeed(job))updateSimilar()
    })
  }

  function mergeSimilarRows(search,rows){
    search.rows=[...new Map([...search.rows,...rows].map(track=>[track.url,track])).values()]
      .sort(rankEvidence).slice(0,48)
  }

  function stopCandidateSearch(job,paused=false){
    for(const search of job.searches.values()){
      if(!search.running)continue
      search.running=false
      search.cancelled=true
      search.paused=paused
      dice.cancelSimilar(search.id).catch(()=>{})
    }
  }

  function dismissSimilar(cancel=false){
    clearTimeout(waitTimer)
    el('analysisDialog').close()
    if(cancel&&preparation){
      stopListening(preparation)
      stopCandidateSearch(preparation)
    }
  }

  function clearSimilar(){
    dismissSimilar(true)
    preparation=null
    el('matches').hidden=true
    el('matchList').replaceChildren()
    el('analysisResults').replaceChildren()
  }

  function showSimilarRows(style,rows){
    const list=()=>rows.map(t=>{
      const li=trackRow(t,()=>dice.listenMatch(t.url),{artwork:true})
      const label=document.createElement('small')
      label.className='similar-evidence'
      const reasons=t.reasons.slice(0,3)
      if(t.sameKey&&(el('sameKeyOnly').checked||el('preferSameKey').checked))reasons.push('Matching key')
      else if(t.compatibleKey&&el('preferSameKey').checked)reasons.push('Compatible key')
      const reasonLabel=document.createElement('span'), key=document.createElement('span')
      reasonLabel.textContent=reasons.join(' · ')
      key.textContent=keySourceLabels(t.keyEvidence,keyLabel).join(' | ')
      label.append(reasonLabel,key)
      li.append(label)
      return li
    })
    el('matchCount').textContent=similarStyles.get(style)||style
    el('matchList').replaceChildren(...list())
    el('analysisResults').replaceChildren(...list())
    el('analysisResults').hidden=!rows.length
    el('matches').hidden=!rows.length
  }

  function seedKey(job){
    return keyEvidence({audio:job.track.playbackKey,imported:job.track.estimatedKey,listed:job.track.publishedKey})
  }

  function updateSimilar(){
    const job=preparation
    if(!isCurrentSimilarSeed(job)||!el('analysisDialog').open)return
    const style=el('matchStyle').value
    const search=job.searches.get(style)
    const seed={...job.track,keyEvidence:seedKey(job)}
    const sameKeyOnly=el('sameKeyOnly').checked, preferSameKey=el('preferSameKey').checked
    const issue=sameKeyOnly?sameKeyIssue(seed.keyEvidence):''
    const recent=job.recent??=recentSimilarTracks(seed)
    const rows=selectSimilar(search?.rows||[],{seed,sameKeyOnly,preferSameKey,recent})
    const count=rows.length
    const pending=!!search?.running&&!issue
    const keep=!!style&&!pending&&(search?.paused||!issue&&count<10&&search?.hasMore!==false&&
      (search?.status==='timeout'||search?.hasMore||!count&&!!search&&!search.cancelled))
    const progress=el('analysisProgress')
    el('analysisKey').textContent=keySourceLabels(seed.keyEvidence,keyLabel).join(' | ')
    el('analysisKey').hidden=false
    const visible=JSON.stringify(rows.map(({url,sameKey,compatibleKey,reasons,keyEvidence:keys})=>[
      url,sameKey&&(sameKeyOnly||preferSameKey),compatibleKey&&preferSameKey,reasons,keys
    ]))
    if(job.visible!==visible){
      job.visible=visible
      showSimilarRows(style,rows)
      rememberSimilarTracks(seed,rows)
    }
    el('analysisKeep').hidden=!keep
    el('analysisCancel').textContent=pending||search?.paused?'Cancel':'Close'
    progress.hidden=!pending||!!count
    progress.removeAttribute('value')
    let message
    if(!style)message='Choose a DJ subgenre.'
    else if(issue)message=issue+(search?.paused?' Keep searching resumes preparation.':'')
    else if(count)message=count+' '+(count===1?'suggestion':'suggestions')+' based on listing details.'+
      (rows.every(row=>row.seedScore===0)?' The listings give little evidence beyond the selected subgenre.':'')+
      (keep?' Keep searching to check more listings.':'')
    else if(pending)message='Checking SoundCloud for similar styles…'
    else if(search?.paused)message='No suggestions are ready yet. Keep searching or cancel.'
    else if(search?.error)message=search.error
    else if(search?.status==='network')message='Some SoundCloud pages or track details could not be retrieved. Keep searching to try again.'
    else if(search?.status==='parse')message='Some SoundCloud listings or track details could not be read. Keep searching to try again.'
    else if(search?.status==='timeout')message='The search reached its time limit. Keep searching to check more listings.'
    else if(sameKeyOnly&&search?.rows.length)message='No known keys matched in the checked suggestions. Keep searching or turn off Same key only.'
    else if(search?.status==='filtered')message='The retrieved tracks did not meet the selected subgenre or duration checks.'
    else if(search?.status==='empty')message='SoundCloud returned no suitable track listings for this subgenre.'
    else message='No similar tunes were found in the listings checked.'
    if(el('analysisStatus').textContent!==message)el('analysisStatus').textContent=message
  }

  function waitForSimilar(){
    clearTimeout(waitTimer)
    updateSimilar()
    const job=preparation
    waitTimer=setTimeout(()=>{
      if(preparation===job&&el('analysisDialog').open&&job.searches.get(el('matchStyle').value)?.running){
        stopCandidateSearch(job,true)
        stopListening(job)
        updateSimilar()
      }
    },10000)
  }

  function receiveSimilarResults(request,rows){
    const job=preparation
    if(!isCurrentSimilarSeed(job)||request.url!==similarTrackURL(job.track.url)||request.revision!==job.track.playbackRevision||
      request.style!==el('matchStyle').value)return
    const search=job.searches.get(request.style)
    if(!search?.running||search.id!==request.id)return
    mergeSimilarRows(search,rows)
    updateSimilar()
  }

  function findSimilar(){
    if(isBusy()||!getCurrent())return
    const dialog=el('analysisDialog')
    if(dialog.open)return
    if(!preparation)setPreparation(getCurrent())
    const job=preparation
    const style=el('matchStyle').value
    if(style&&!job.key&&!job.listening&&!job.analysisFinished)listenInBackground(job,armCapture())
    const search=job.searches.get(style)
    prepareCandidates(job,!!search?.cancelled&&!search.rows.length)
    dialog.show()
    job.visible=null
    el('analysisResults').hidden=true
    waitForSimilar()
  }

  function changeSimilarStyle(){
    if(!preparation)return
    stopCandidateSearch(preparation)
    preparation.visible=null
    el('matches').hidden=true
    el('matchList').replaceChildren()
    el('analysisResults').hidden=true
    const style=el('matchStyle').value
    const selected=preparation.searches.get(style)
    prepareCandidates(preparation,!!selected?.cancelled&&!selected.rows.length)
    if(el('analysisDialog').open)waitForSimilar()
  }
  if(!friendsBeta){
    dice.onSimilarResults(receiveSimilarResults)
    el('matchStyle').onchange=changeSimilarStyle
    el('sameKeyOnly').onchange=el('preferSameKey').onchange=updateSimilar
    el('similar').onclick=action(findSimilar)
    el('analysisKeep').onclick=()=>{
      if(!preparation)return
      if(!preparation.key&&!preparation.listening&&!preparation.analysisFinished)
        listenInBackground(preparation,armCapture())
      prepareCandidates(preparation,true)
      waitForSimilar()
    }
    el('analysisCancel').onclick=()=>dismissSimilar(el('analysisCancel').textContent==='Cancel')
    el('analysisRoll').onclick=()=>el('roll').click()
    el('analysisDialog').addEventListener('cancel',event=>{event.preventDefault();dismissSimilar(true)})
  }

  return {paintKey,setPreparation,clearSimilar,armCapture,dismissSimilar,changeSimilarStyle}
}
