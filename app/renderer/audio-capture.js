function createAudioCapture(){
  function estimate(channels,sampleRate,signal,quick=false){
    return new Promise((resolve,reject)=>{
      signal?.throwIfAborted()
      const worker=new Worker('key-analysis.js')
      const finish=(error,result)=>{
        worker.terminate()
        signal?.removeEventListener('abort',abort)
        if(error)reject(error)
        else resolve(result)
      }
      const abort=()=>finish(signal.reason)
      signal?.addEventListener('abort',abort,{once:true})
      worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data)
      worker.onerror=()=>finish(new Error('Audio analysis failed. Try again.'))
      worker.postMessage({channels,sampleRate,quick},channels.map(channel=>channel.buffer))
    })
  }

  const captureSeconds=30
  const minimumSeconds=16
  const firstPassSeconds=16
  const earlyCheckSeconds=12
  const earlyChecks=[earlyCheckSeconds,14,firstPassSeconds]
  const captureFailure='Could not capture audio from this app. Check the SoundCloud preview and retry.'

  async function openPlayback(signal){
    let stream
    try{
      const pending=navigator.mediaDevices.getDisplayMedia({video:true,audio:{
        channelCount:{ideal:2},echoCancellation:false,noiseSuppression:false,autoGainControl:false
      }})
      stream=await new Promise((resolve,reject)=>{
        let expired=false
        const stop=()=>reject(signal.reason)
        const timer=setTimeout(()=>{expired=true;reject(Error(captureFailure))},8000)
        signal.addEventListener('abort',stop,{once:true})
        pending.then(media=>{
          if(signal.aborted||expired)media.getTracks().forEach(track=>track.stop())
          else resolve(media)
        },reject).finally(()=>{
          clearTimeout(timer)
          signal.removeEventListener('abort',stop)
        })
      })
      signal.throwIfAborted()
      stream.getVideoTracks().forEach(track=>track.stop())
      const track=stream.getAudioTracks()[0]
      if(!track||track.readyState==='ended')throw Error(captureFailure)
      return track
    }catch(error){
      stream?.getTracks().forEach(track=>track.stop())
      signal.throwIfAborted()
      throw Error(captureFailure)
    }
  }

  async function capturePlayback(track,signal,report){
    const failure=captureFailure
    let context,source,processor,sink
    signal.throwIfAborted()
    if(track.readyState==='ended')throw Error(failure)
    const insufficient=message=>Object.assign(Error(message),{code:'INSUFFICIENT_AUDIO'})
    try{
      context=new AudioContext({sampleRate:22050})
      const sampleRate=context.sampleRate
      const target=sampleRate*captureSeconds
      const minimum=sampleRate*minimumSeconds
      const recording=await new Promise((resolve,reject)=>{
        const channels=[new Float32Array(target),new Float32Array(target)]
        let written=0,received=0,audible=0,quiet=0,finished=false,earlyCheck
        let check=0
        const finish=(error,earlyResult)=>{
          if(finished)return
          finished=true
          clearTimeout(timer)
          clearTimeout(startup)
          signal.removeEventListener('abort',stop)
          track.removeEventListener('ended',ended)
          if(processor)processor.onaudioprocess=null
          if(error)reject(error)
          else if(earlyResult)resolve({earlyResult})
          else resolve({channels:channels.map(samples=>samples.slice(0,written)),sampleRate})
        }
        const ended=()=>finish(Error(failure))
        const stop=()=>finish(signal.reason)
        const startup=setTimeout(()=>{if(!received)finish(Error(failure))},6000)
        const timer=setTimeout(()=>{
          if(!received)finish(Error(failure))
          else if(!audible)finish(insufficient('No audible SoundCloud playback was captured. Press Play and try again.'))
          else if(audible<minimum)finish(insufficient('Too little audible playback was captured. Keep the tune playing and try again.'))
          else finish()
        },(captureSeconds+9)*1000)
        signal.addEventListener('abort',stop,{once:true})
        track.addEventListener('ended',ended,{once:true})
        try{
          source=context.createMediaStreamSource(new MediaStream([track]))
          processor=context.createScriptProcessor(4096,2,1)
          processor.onaudioprocess=({inputBuffer})=>{
            const left=inputBuffer.getChannelData(0),right=inputBuffer.getChannelData(1)
            let energy=0
            for(let i=0;i<left.length;i++)energy+=left[i]**2+right[i]**2
            received+=left.length
            const playing=energy/(2*left.length)>=0.000001
            if(!written&&!playing){
              if(received>=sampleRate*8)finish(insufficient('No audible SoundCloud playback was captured. Press Play and try again.'))
              return
            }
            const count=Math.min(left.length,target-written)
            if(playing){audible+=count;quiet=0}
            else quiet+=count
            if(quiet>=sampleRate*4){
              if(audible>=minimum){written-=quiet-count;finish()}
              else finish(insufficient('Playback paused or went silent before enough audio was captured. Keep the tune playing and try again.'))
              return
            }
            channels[0].set(left.subarray(0,count),written)
            channels[1].set(right.subarray(0,count),written)
            written+=count
            report(written/sampleRate)
            if(!earlyCheck&&audible>=earlyChecks[check]*sampleRate&&written<target){
              // Send a snapshot to the worker while the live buffer continues filling.
              check++
              earlyCheck=estimate(channels.map(samples=>samples.slice(0,written)),sampleRate,signal,true)
              earlyCheck.then(result=>{
                earlyCheck=null
                if(result.key)finish(null,result)
              },error=>finish(error))
            }
            if(written===target){
              if(audible>=minimum)finish()
              else finish(insufficient('Too little audible playback was captured. Keep the tune playing and try again.'))
            }
          }
          sink=context.createGain()
          sink.gain.value=0
          source.connect(processor).connect(sink).connect(context.destination)
          context.resume().catch(()=>finish(Error(failure)))
        }catch{finish(Error(failure))}
      })
      return recording
    }finally{
      source?.disconnect()
      processor?.disconnect()
      sink?.disconnect()
      if(context)await context.close()
    }
  }

  return {estimate,openPlayback,capturePlayback,captureSeconds,earlyCheckSeconds,captureFailure}
}
