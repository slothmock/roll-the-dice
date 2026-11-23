function initializeCollections({el,action,dice,getCurrent,isBusy,change,similarStyles,downloadAssistant,friendsBeta}){
  let artistFavourites=[], feedRequest=0, feedRows=[], feedArtists=[]
  let feedStarted=false
  function button(label,fn){
    const element=document.createElement('button')
    element.textContent=label
    element.onclick=action(fn)
    return element
  }
  function dateLabel(track){
    return track.date?track.date.label+' '+new Date(track.date.time).toLocaleDateString():''
  }
  function paintTrackActions(){
    if(!getCurrent())return
    const track=getCurrent()
    const saved=artistFavourites.some(fav=>fav.profile===track.profile)
    el('favourite').textContent=saved?'★ Favourited':'Favourite artist'
    el('favourite').disabled=!track.profile
    el('favourite').setAttribute('aria-pressed',String(saved))
    el('favourite').title=track.profile?'SoundCloud uploader profile: '+track.profile:'SoundCloud uploader profile unavailable'
    el('artist').textContent=track.artist||track.profile?.split('/').pop()||'Unknown uploader'
    el('artist').title=el('artist').textContent+' · SoundCloud uploader'
    el('trackDate').textContent=dateLabel(track)
    const genre=similarStyles.get(track.genre)||similarStyles.get(track.genres?.[0])
    el('trackGenre').textContent=genre||''
    el('trackGenre').hidden=!genre
    el('freeDownload').hidden=!track.freeDownload
    el('trackBadges').hidden=!genre&&!track.freeDownload
    downloadAssistant.paint(track)
  }
  function paintFavourites(){
    el('artistList').replaceChildren(...artistFavourites.map(fav=>{
      const li=document.createElement('li')
      li.append(fav.name+' ('+fav.profile.split('/').pop()+') ',button('Remove',async()=>{
        artistFavourites=await dice.removeFavourite(fav.profile)
        favouritesChanged()
      }))
      return li
    }))
    if(!artistFavourites.length)el('artistList').textContent='No favourite artists yet.'
    el('refreshFeed').disabled=!artistFavourites.length
    if(!artistFavourites.length||!feedStarted)el('feedStatus').textContent=artistFavourites.length?
      'Refresh to check for uploads.' : 'Roll or preview a track, then select Favourite artist to see their recent uploads here.'
    paintTrackActions()
  }
  function favouritesChanged(){
    paintFavourites()
    const currentProfiles=new Set(artistFavourites.map(fav=>fav.profile))
    feedRows=feedRows.filter(row=>currentProfiles.has(row.favouriteProfile))
    feedArtists=feedArtists.filter(artist=>currentProfiles.has(artist.profile))
    paintFeed()
    paintFeedArtists()
    action(refreshFeed)()
  }
  el('favourite').onclick=action(async()=>{
    if(isBusy()||!getCurrent())return
    const control=el('favourite')
    control.disabled=true
    try{artistFavourites=await dice.toggleFavourite(getCurrent().url);favouritesChanged()}
    finally{paintTrackActions()}
  })
  function trackRow(track,listen,{artwork=false,uploadDate=false}={}){
    const li=document.createElement('li')
    li.className='track-row'
    const title=track.title||track.url.split('/').pop()
    const label=document.createElement('div')
    label.className='track-label'
    if(artwork){
      const thumbnail=document.createElement('span')
      thumbnail.className='row-thumb'
      thumbnail.setAttribute('aria-hidden','true')
      const art=track.art||track.listedArt
      if(art){
        const image=document.createElement('img')
        image.src=art;image.alt='';image.width=image.height=42;image.loading='lazy'
        image.onerror=()=>image.remove()
        thumbnail.append(image)
      }
      label.append(thumbnail)
    }
    const line=document.createElement('div'), heading=document.createElement('strong'), detail=document.createElement('small')
    line.className='track-line';heading.className='row-title';detail.className='row-details'
    heading.textContent=heading.title=title
    detail.textContent=[track.creditedArtist||track.artist,dateLabel(track)||(uploadDate?'Upload date unavailable':'')].filter(Boolean).join(' · ')
    line.append(heading,' ',detail)
    label.append(line)
    const actions=document.createElement('div'), preview=button('',()=>change(listen)), previewLabel=document.createElement('span')
    actions.className='row-actions';preview.className='preview-action';previewLabel.textContent='Preview'
    preview.setAttribute('aria-label','Preview '+title)
    preview.append(previewLabel)
    preview.dataset.listen=track.url
    actions.append(preview)
    li.append(label,actions)
    return li
  }
  function paintFeed(){
    const genre=el('feedGenre').value
    const rows=genre?feedRows.filter(t=>t.genres.includes(genre)):feedRows
    el('feedList').replaceChildren(...rows.map(t=>trackRow(t,()=>dice.listenTrack(t.url),{artwork:true,uploadDate:true})))
    if(!rows.length&&feedRows.length)el('feedList').textContent='No uploads in this genre. Choose All genres to see the full list.'
  }
  function paintFeedArtists(){
    const messages={empty:'No verified uploads of ten minutes or less.',network:'SoundCloud did not load this profile or its track details.',
      parse:'SoundCloud returned listings the app could not read.',partial:'Some uploads could not be checked.',
      identity:'SoundCloud did not confirm this saved profile URL.'}
    const reports=feedArtists.filter(artist=>messages[artist.status])
    el('feedArtists').hidden=!reports.length
    el('feedArtists').replaceChildren(...reports.map(artist=>{
      const li=document.createElement('li')
      const retained=artist.rowCount?' Showing available verified uploads.':''
      li.append(artist.name+' · '+messages[artist.status]+retained)
      if(artist.status!=='empty')li.append(' ',button('Retry '+artist.name,()=>refreshFeed(true,artist.profile)))
      return li
    }))
    const checked=Math.max(0,...feedArtists.map(artist=>artist.checkedAt))
    el('feedChecked').textContent=checked?'Last checked '+new Date(checked).toLocaleString():''
  }
  function ensureFeed(){
    if(artistFavourites.length&&!feedStarted)action(refreshFeed)()
  }
  async function refreshFeed(force=false,profile){
    const request=++feedRequest
    el('refreshFeed').disabled=!artistFavourites.length
    feedStarted=!!artistFavourites.length
    if(!feedStarted){
      el('feedList').removeAttribute('aria-busy')
      el('feedStatus').textContent='Roll or preview a track, then select Favourite artist to see their recent uploads here.'
      return
    }
    el('refreshFeed').disabled=true
    el('feedList').setAttribute('aria-busy','true')
    el('feedStatus').textContent=feedRows.length?'Refreshing uploads. Showing the last verified tracks.':'Checking favourite profiles…'
    try{
      const {rows,artists}=await dice.favouriteUploads(force===true,profile,request)
      if(request!==feedRequest)return
      feedRows=rows
      feedArtists=artists
      paintFeed()
      paintFeedArtists()
      el('feedStatus').textContent=rows.length?'':artists.every(artist=>artist.status==='empty')?
        'No eligible uploads from your favourites.':'No verified uploads are available from the latest check.'
    }catch(error){
      if(request===feedRequest)el('feedStatus').textContent='Could not refresh favourite uploads. Try again.'
    }finally{
      if(request===feedRequest){
        el('refreshFeed').disabled=false
        el('feedList').removeAttribute('aria-busy')
      }
    }
  }
  dice.onFavouriteUpdates((request,{rows,artists})=>{
    if(request!==feedRequest||!feedStarted)return
    feedRows=rows
    feedArtists=artists
    paintFeed()
    paintFeedArtists()
  })
  el('refreshFeed').onclick=action(()=>refreshFeed(true))
  el('feedGenre').onchange=paintFeed
  function setup(favourites){
    artistFavourites=favourites
    paintFavourites()
    if(friendsBeta||el('appMain').dataset.page==='favourites')ensureFeed()
  }
  return {setup,paintTrackActions,trackRow,ensureFeed}
}
