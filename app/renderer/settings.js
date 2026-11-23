function initializeSettings({el,dice,prepareRoll,similarStyles,friendsBeta}){
  let favourites=[],tasteArtists=[],guideAtStartup=true

  function setup(genreMenu,profile,selectedGenre){
    favourites=profile?.genres||[]
    tasteArtists=profile?.artists||[]
    const menu=el('genre')
    menu.add(new Option('Choose a genre',''))
    for(const {label,options} of genreMenu){
      const group=document.createElement('optgroup')
      group.label=label
      const matchGroup=friendsBeta?null:document.createElement('optgroup')
      if(matchGroup)matchGroup.label=label
      const feedGroup=document.createElement('optgroup')
      feedGroup.label=label
      const field=document.createElement('fieldset'), legend=document.createElement('legend')
      legend.textContent=label
      field.append(legend)
      for(const {id,label:style} of options){
        group.append(new Option(style,id))
        if(matchGroup)matchGroup.append(new Option(style,id))
        feedGroup.append(new Option(style,id))
        similarStyles.set(id,style)
        const choice=document.createElement('label'), checkbox=document.createElement('input')
        checkbox.type='checkbox';checkbox.value=id
        choice.append(checkbox,style)
        field.append(choice)
      }
      menu.append(group)
      if(matchGroup)el('matchStyle').append(matchGroup)
      el('feedGenre').append(feedGroup)
      el('favourites').append(field)
    }
    updateGenres(favourites)
    menu.value=selectedGenre
  }

  const helpText={
    roll:'Find a new track with a free-download listing in the selected genre (R)',
    undo:'Return to your previous track and rating (Z)',
    similar:'Find tunes using genre, listing details and your favourites',
    copyLink:'Copy the SoundCloud track URL',
    dial:'Chance of a random pick instead of a taste-weighted pick',
  }
  for(const [id,tip] of Object.entries(helpText))if(el(id))el(id).title=tip
  el('help').onclick=()=>{
    for(const input of el('favourites').querySelectorAll('input'))input.checked=favourites.includes(input.value)
    el('artists').value=tasteArtists.join(', ')
    el('settingsError').textContent=''
    el('settingsDialog').showModal()
  }
  el('closeSettings').onclick=()=>el('settingsDialog').close()
  function openGuide(){
    el('hideGuideStartup').checked=!guideAtStartup
    el('guideError').textContent=''
    if(!el('guide').open)el('guide').showModal()
  }
  function showStartupGuide(show=true){
    guideAtStartup=show!==false
    el('hideGuideStartup').checked=!guideAtStartup
    if(guideAtStartup)openGuide()
  }
  el('openGuide').onclick=openGuide
  el('closeGuide').onclick=()=>el('guide').close()
  el('hideGuideStartup').onchange=async()=>{
    const checkbox=el('hideGuideStartup')
    if(checkbox.disabled)return
    checkbox.disabled=true
    el('guideError').textContent=''
    try{
      const saved=await dice.guideStartup(!checkbox.checked)
      if(typeof saved!=='boolean')throw Error('Could not save the guide preference.')
      guideAtStartup=saved
    }catch(error){el('guideError').textContent=error.message}
    finally{checkbox.checked=!guideAtStartup;checkbox.disabled=false}
  }
  el('finish').onclick=async()=>{
    try{
      const genres=Array.from(el('favourites').querySelectorAll('input:checked'),input=>input.value)
      const profile=await dice.profile(genres,el('artists').value.split(','))
      favourites=profile.genres
      tasteArtists=profile.artists
      updateGenres(favourites)
      prepareRoll()
      el('settingsDialog').close()
    }catch(e){el('settingsError').textContent=e.message}
  }

  function updateGenres(genres){
    const menu=el('genre'),old=menu.querySelector('option[value="@favourites"]')
    const selected=menu.value
    if(old)old.remove()
    if(genres.length>1){
      menu.insertBefore(new Option('Mix my favourite genres','@favourites'),menu.children[1]||null)
    }
    menu.value=selected==='@favourites' && genres.length<2?'DnB Rollers':selected
  }

  return {setup,showStartupGuide}
}
