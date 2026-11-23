function initializeDownloadAssistant({el,action,dice,getCurrent}){
  let downloadDetails={email:'',comment:''}, downloadOptions=[], downloadTrack
  function paintDownloadDetails(){
    el('copyEmail').hidden=!downloadDetails.email
    el('copyComment').hidden=!downloadDetails.comment
    el('clearEmail').disabled=!downloadDetails.email
  }
  function paintDownloadDestination(){
    const option=downloadOptions[Number(el('downloadDestination').value)]
    if(!option)return
    el('downloadProvider').textContent=[...new Set([option.provider,option.domain])].join(' · ')
    el('openDownload').textContent=option.kind==='purchase'?'Open purchase page':'Open download page'
  }
  function paintDownloadAssistant(track){
    if(downloadTrack===track)return
    downloadTrack=track
    downloadOptions=(track.destinations||[]).filter(destination=>destination.kind!=='track')
    el('downloadContext').hidden=!downloadOptions.length
    el('downloadAvailability').hidden=!!downloadOptions.length
    el('downloadAvailability').textContent='No download page was found in the available listing. Check the SoundCloud track for details.'
    el('downloadStatus').textContent=''
    el('downloadChoice').hidden=downloadOptions.length<2
    el('downloadDestination').replaceChildren(...downloadOptions.map((option,i)=>new Option(option.provider+' · '+option.label,String(i))))
    paintDownloadDestination()
  }
  el('downloadDestination').onchange=()=>{
    el('downloadStatus').textContent=''
    paintDownloadDestination()
  }
  el('openDownload').onclick=async()=>{
    const track=getCurrent(), option=downloadOptions[Number(el('downloadDestination').value)]
    if(!track||!option)return
    try{
      const message=await dice.gate(track.url,option.url)
      if(getCurrent()===track)el('downloadStatus').textContent=message
    }catch{
      if(getCurrent()===track)el('downloadStatus').textContent='Could not open this destination. Check the artist’s SoundCloud listing.'
    }
  }
  function copyDownloadDetail(field,label){
    return async()=>{
      const track=getCurrent(), value=downloadDetails[field]
      if(!value)return
      try{
        await dice.copy(value)
        if(getCurrent()===track)el('downloadStatus').textContent=label+' copied.'
      }catch{
        if(getCurrent()===track)el('downloadStatus').textContent='Clipboard unavailable. Open My download details to copy the text manually.'
      }
    }
  }
  el('copyEmail').onclick=copyDownloadDetail('email','Email')
  el('copyComment').onclick=copyDownloadDetail('comment','Comment')
  el('downloadForm').onsubmit=async event=>{
    event.preventDefault()
    if(!el('downloadForm').reportValidity())return
    try{
      downloadDetails=await dice.saveDownloadDetails(el('mail').value,el('comment').value)
      paintDownloadDetails()
      el('downloadStatus').textContent='Download details saved on this PC.'
    }catch(error){
      el('downloadStatus').textContent=error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')
    }
  }
  el('clearEmail').onclick=action(async()=>{
    downloadDetails=await dice.clearDownloadEmail()
    el('mail').value=''
    paintDownloadDetails()
    el('downloadStatus').textContent='Saved email cleared.'
  })
  function setDetails(details){
    downloadDetails=details
    el('mail').value=details.email
    el('comment').value=details.comment
    paintDownloadDetails()
  }
  return {setDetails,paint:paintDownloadAssistant}
}
