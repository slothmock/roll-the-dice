const fs=require('node:fs')
const {trackURL}=require('./discovery')
const {soundCloudProfile}=require('./favourites')
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string')
function invalid(){throw Object.assign(Error('The library data has an invalid structure.'),{code:'INVALID_LIBRARY'})}
function validateLibrary(value){
  if(!record(value))invalid()
  const state={seen:[],email:'',ratings:{},wildcard:20,artistFavourites:{},savedTracks:{},...value}
  if(!strings(state.seen)||!state.seen.every(url=>trackURL(url)===url)||typeof state.email!=='string'||
      !Number.isInteger(state.wildcard)||state.wildcard<0||state.wildcard>100)invalid()
  if(state.showGuideAtStartup!==undefined&&typeof state.showGuideAtStartup!=='boolean')invalid()
  for(const field of ['downloadComment','comment','discoveryGenre']){
    if(state[field]!==undefined&&typeof state[field]!=='string')invalid()
  }
  if(state.profile!=null&&(!record(state.profile)||!strings(state.profile.genres)||!strings(state.profile.artists)))invalid()
  if(!record(state.ratings)||!Object.entries(state.ratings).every(([url,rating])=>
      trackURL(url)===url&&record(rating)&&Number.isInteger(rating.stars)&&rating.stars>=1&&rating.stars<=5&&
      ['term','title','styleTags','artist'].every(key=>rating[key]===undefined||typeof rating[key]==='string')))invalid()
  if(!record(state.artistFavourites)||!Object.entries(state.artistFavourites).every(([url,item])=>
      soundCloudProfile(url)===url&&record(item)&&item.profile===url&&typeof item.name==='string'))invalid()
  if(!record(state.savedTracks)||!Object.entries(state.savedTracks).every(([url,track])=>{
    if(trackURL(url)!==url||!record(track)||track.url!==url)return false
    for(const key of ['title','artist','term','genre','tags','styleTags','uploaderDescription','listedTitle','listedTags','listedGenre','uploaderProfile','art','listedArt']){
      if(track[key]!=null&&typeof track[key]!=='string')return false
    }
    if(track.links!==undefined&&!strings(track.links))return false
    if(track.actions!==undefined&&(!Array.isArray(track.actions)||!track.actions.every(action=>record(action)&&typeof action.url==='string'&&typeof action.label==='string')))return false
    if(track.date!=null&&(!record(track.date)||!Number.isFinite(track.date.time)||typeof track.date.label!=='string'))return false
    if(track.duration!==undefined&&(!Number.isFinite(track.duration)||track.duration<=0))return false
    return true
  }))invalid()
  for(const field of ['playbackKeys','estimatedKeys']){
    if(state[field]!==undefined&&(!record(state[field])||!Object.entries(state[field]).every(([url,key])=>trackURL(url)===url&&typeof key==='string')))invalid()
  }
  return state
}

function openLibrary(file,{fs:io=fs,onRecovery}={}){
  function read(candidate){
    let raw
    try{raw=io.readFileSync(candidate)}
    catch(error){if(error.code==='ENOENT')return {missing:true};throw error}
    try{return {state:validateLibrary(JSON.parse(raw.toString('utf8')))}}
    catch(error){
      if(!(error instanceof SyntaxError)&&error.code!=='INVALID_LIBRARY')throw error
      return {raw,error}
    }
  }
  const current=read(file)
  let state=current.state
  if(!state){
    const backup=read(file+'.bak')
    if(current.missing&&backup.missing)state=validateLibrary({})
    else{
      if(!onRecovery)throw current.error||backup.error||Error('The library needs recovery.')
      const damaged=[[file,current],[file+'.bak',backup]].filter(([,item])=>item.error)
        .map(([source,item])=>({source,raw:item.raw,destination:source+'.corrupt-'+require('node:crypto').randomUUID()}))
      if(!onRecovery({file,hasBackup:!!backup.state,preservedPaths:damaged.map(item=>item.destination)}))return null
      for(const item of damaged)io.writeFileSync(item.destination,item.raw,{encoding:'utf8',flag:'wx'})
      state=backup.state||validateLibrary({})
      io.writeFileSync(file+'.tmp',JSON.stringify(state),'utf8')
      io.renameSync(file+'.tmp',file)
    }
  }
  let saved=JSON.stringify(state)
  return {state,save(){
    try{
      validateLibrary(state)
      const next=JSON.stringify(state)
      io.writeFileSync(file+'.tmp',next,'utf8')
      io.writeFileSync(file+'.bak.tmp',saved,'utf8')
      io.renameSync(file+'.bak.tmp',file+'.bak')
      io.renameSync(file+'.tmp',file)
      saved=next
    }catch(error){
      for(const key of Object.keys(state))delete state[key]
      Object.assign(state,JSON.parse(saved))
      throw error
    }
  }}
}
module.exports={openLibrary}
