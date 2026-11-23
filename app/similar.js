const similarKeyPattern=/^(?:[1-9]|1[0-2])[AB]$/
const styleDescriptors=[
  'afro','acid','atmospheric','breakbeats?','chilled','cinematic','dark','deep','dreamy','dubwise',
  'euphoric','foghorn','funky','garage swing','gospel','gritty','halftime','hypnotic','jazzy','lush',
  'melodic','minimal','old school','orchestral','piano','rolling bassline','soulful','stripped back',
  'techstep','vocal','wobble'
].map(value=>new RegExp('\\b'+value+'\\b','i'))

function evidenceText(value){
  return typeof value==='string'?value.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim():''
}

function keyEvidence({audio,imported,listed}={}){
  const valid=value=>similarKeyPattern.test(value||'')?value:''
  const keys={audio:valid(audio),imported:valid(imported),listed:valid(listed)}
  const distinct=new Set(Object.values(keys).filter(Boolean))
  return {...keys,key:distinct.size===1?[...distinct][0]:'',conflict:distinct.size>1}
}

function keySourceLabels(evidence,format=value=>value){
  const categories=[['audio','Audio estimate'],['imported','Imported audio estimate'],['listed','Uploader-listed key']]
  const labels=categories.filter(([source])=>evidence?.[source]).map(([source,label])=>label+' · '+format(evidence[source]))
  return labels.length?labels:['Key unknown']
}

function sameKeyIssue(evidence){
  if(evidence?.key)return ''
  return evidence?.conflict?'The playing track has conflicting key evidence. Turn off Same key only to browse by style.':
    'The playing track’s key is unknown. Keep the preview playing for an estimate, or turn off Same key only.'
}

function styleEvidence(track){
  const text=evidenceText([track.listedTags,track.styleTags,track.uploaderDescription?.slice(0,450)].filter(Boolean).join(' '))
    .replace(/\bdeep (?:house|dubstep)\b/g,' ')
  return styleDescriptors.filter(pattern=>pattern.test(text)).map(pattern=>pattern.source.slice(2,-2).replace(/\?/g,''))
}

function credits(track){
  if(typeof track.creditedArtist!=='string')return []
  return [...new Set(track.creditedArtist.split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i).map(evidenceText).filter(Boolean))]
}

function titleIdentity(title){
  return evidenceText((title||'').replace(/\s*[\[(]?(?:free[ -]?(?:download|dl))[\])]?\s*$/i,''))
}

function originalTitle(track){
  const parts=/^(.+?)\s+[-–—]\s+(.+?)\s*[\[(](?:[^()[\]]+\s+)?(?:remix|bootleg|edit|flip)[\])]/i.exec(track.listedTitle||track.title||'')
  return parts?evidenceText(parts[1]+' '+parts[2]):''
}

function soundCloudId(track){
  const value=String(track.trackId||'')
  return /^(?:soundcloud:tracks:)?(\d+)$/.exec(value)?.[1]||value
}

function similarTrackURL(value){
  return typeof value==='string'?value.split(/[?#]/,1)[0].replace(/\/$/,''):''
}

function trackIdentity(track){
  const id=soundCloudId(track)
  return id?'track:'+id:similarTrackURL(track.url)
}

function duplicateUpload(first,second){
  const url=similarTrackURL(first.url)
  if(url&&url===similarTrackURL(second.url))return true
  const id=soundCloudId(first)
  if(id&&id===soundCloudId(second))return true
  if(first.isrc&&first.isrc===second.isrc)return true
  const artist=evidenceText(first.creditedArtist)
  return !!artist&&artist===evidenceText(second.creditedArtist)&&!!titleIdentity(first.title)&&
    titleIdentity(first.title)===titleIdentity(second.title)&&
    Number.isFinite(first.duration)&&Number.isFinite(second.duration)&&Math.abs(first.duration-second.duration)<=2000
}

function durationIssue(duration){
  if(!Number.isFinite(duration)||duration<=0)return 'unverifiedDuration'
  return duration>600000?'duration':''
}

function keyAffinity(seed,candidate){
  if(!similarKeyPattern.test(seed||'')||!similarKeyPattern.test(candidate||''))return 0
  if(seed===candidate)return 2
  const distance=Math.abs(Number(seed.slice(0,-1))-Number(candidate.slice(0,-1)))
  return distance===0||seed.at(-1)===candidate.at(-1)&&(distance===1||distance===11)?1:0
}

function describeRecommendation(seed,track,{sameStyle,related=false,favourites=[],ratings={},artists=[],keys}={}){
  const reasons=[sameStyle?'Same subgenre':'Selected subgenre']
  let score=0
  const add=(reason,weight)=>{reasons.push(reason);score+=weight}
  const seedArtists=credits(seed), trackArtists=credits(track)
  if(seedArtists.length&&trackArtists.some(artist=>seedArtists.includes(artist))){
    if(evidenceText(seed.creditedArtist)===evidenceText(track.creditedArtist))add('Same credited artist',9)
    else add('Shared artist credit',7)
  }else if(seed.profile&&seed.profile===track.profile)add('Same uploader',4)
  const label=evidenceText(seed.labelName)
  if(label&&label===evidenceText(track.labelName))add('Same label',6)
  const seedOriginal=originalTitle(seed), candidateOriginal=originalTitle(track)
  if((seedOriginal&&seedOriginal===(candidateOriginal||titleIdentity(track.title)))||
     (candidateOriginal&&candidateOriginal===titleIdentity(seed.title)))add('Same original track',6)
  if(related)add('Related on SoundCloud',5)
  const seedStyles=styleEvidence(seed)
  const shared=styleEvidence(track).filter(value=>seedStyles.includes(value))
  if(shared.length)add('Shared style: '+shared.slice(0,2).join(', '),Math.min(5,shared.length*2))
  const seedScore=score
  if(favourites.includes(track.profile)||artists.some(name=>[...trackArtists,evidenceText(track.artist)].includes(evidenceText(name))))
    add('Based on your favourites',4)
  const rating=ratings[track.url]?.stars
  if(rating>=4)add('Highly rated by you',rating-2)
  else if(rating>0&&rating<=2)score-=3-rating
  else if(track.profile){
    const byUploader=Object.entries(ratings).filter(([url,entry])=>url.startsWith(track.profile+'/')&&entry?.stars>0)
    if(byUploader.length&&byUploader.reduce((sum,[,entry])=>sum+entry.stars,0)/byUploader.length>=4)
      add('Uploader you rate highly',2)
  }
  return {...track,seedScore,score,reasons,keyEvidence:keys||keyEvidence()}
}

function rankEvidence(first,second){
  return (second.rank??second.score)-(first.rank??first.score)||(second.seedScore||0)-(first.seedScore||0)
}

function selectSimilar(candidates,{seed,sameKeyOnly=false,preferSameKey=false,limit=10,recent}={}){
  if(sameKeyOnly&&!seed?.keyEvidence?.key)return []
  const key=seed?.keyEvidence?.key
  const ranked=candidates.filter(track=>!durationIssue(track.duration)&&!duplicateUpload(seed||{},track))
    .map(track=>{
      const affinity=keyAffinity(key,track.keyEvidence?.key)
      return {...track,sameKey:affinity===2,compatibleKey:affinity===1,
        rank:track.score+(preferSameKey?affinity:0)}
    }).filter(track=>!sameKeyOnly||track.sameKey).sort((first,second)=>rankEvidence(first,second)||
      (recent?Number(recent.has(trackIdentity(first)))-Number(recent.has(trackIdentity(second))):0))
  const unique=[],artistCounts=new Map(),uploaderCounts=new Map()
  for(const track of ranked){
    if(unique.some(row=>duplicateUpload(row,track)))continue
    if(track.profile&&(uploaderCounts.get(track.profile)||0)>=2)continue
    const artists=credits(track)
    if(artists.some(artist=>(artistCounts.get(artist)||0)>=2))continue
    unique.push(track)
    if(track.profile)uploaderCounts.set(track.profile,(uploaderCounts.get(track.profile)||0)+1)
    for(const artist of artists)artistCounts.set(artist,(artistCounts.get(artist)||0)+1)
    if(unique.length>=limit)break
  }
  return unique
}

if(typeof module!=='undefined')module.exports={
  keyEvidence,keySourceLabels,sameKeyIssue,styleEvidence,originalTitle,similarTrackURL,trackIdentity,duplicateUpload,durationIssue,
  describeRecommendation,rankEvidence,selectSimilar
}
