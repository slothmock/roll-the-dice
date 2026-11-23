function createPlayerWidget({el}){
  let previewCheck
  const widgetOrigin='https://w.soundcloud.com'

  function widgetRequest(method,signal){
    const widget=el('player').contentWindow
    return new Promise(resolve=>{
      if(signal.aborted||!widget){resolve();return}
      const finish=value=>{
        clearTimeout(timer)
        window.removeEventListener('message',receive)
        signal.removeEventListener('abort',stop)
        resolve(value)
      }
      const stop=()=>finish()
      const receive=event=>{
        if(event.origin!==widgetOrigin||event.source!==widget)return
        try{
          const reply=JSON.parse(event.data)
          if(reply.method===method)finish(reply.value)
        }catch{}
      }
      const timer=setTimeout(stop,850)
      window.addEventListener('message',receive)
      signal.addEventListener('abort',stop,{once:true})
      widget.postMessage(JSON.stringify({method}),widgetOrigin)
    })
  }

  async function checkPreview(track){
    previewCheck?.abort()
    const controller=new AbortController()
    previewCheck=controller
    const {signal}=controller, status=el('playerStatus')
    status.hidden=true
    const waitUntil=performance.now()+12000
    while(!signal.aborted&&performance.now()<waitUntil){
      if(playerTrackURL(await widgetRequest('getCurrentSound',signal))===track.url)return
      if(!signal.aborted)await new Promise(resolve=>setTimeout(resolve,950))
    }
    if(signal.aborted)return
    status.textContent='SoundCloud preview is taking longer than expected. Open SoundCloud if playback is unavailable.'
    status.hidden=false
    const clear=event=>{
      if(event.origin!==widgetOrigin||event.source!==el('player').contentWindow)return
      try{
        if(['play','playProgress'].includes(JSON.parse(event.data).method)){
          status.hidden=true
          controller.abort()
        }
      }catch{}
    }
    window.addEventListener('message',clear,{signal})
  }

  function playerTrackURL(sound){
    if(typeof sound?.permalink_url!=='string')return ''
    return sound.permalink_url.replace(/[?#].*$/,'').replace(/\/$/,'')
  }

  return {widgetRequest,checkPreview,playerTrackURL}
}
