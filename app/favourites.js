const {profileURL,genreMatches,trackURL}=require('./discovery')

function soundCloudProfile(value){
  try{
    const url=new URL(value)
    if(url.origin!=='https://soundcloud.com'||url.username||url.password||url.search||url.hash||
      !/^\/[a-z0-9_-]+\/?$/i.test(url.pathname))return ''
    return url.origin+url.pathname.replace(/\/$/,'').toLowerCase()
  }catch{return ''}
}

function verifiedUpload(track,profile,genres){
  if(!track||soundCloudProfile(profileURL(track))!==profile||
    (track.uploaderProfile&&soundCloudProfile(track.uploaderProfile)!==profile))return null
  if(!Number.isFinite(track.duration)||track.duration<=0||track.duration>600000||track.playable===false)return null
  const uploaded=track.uploadedAt||Date.parse(track.uploaded)
  const time=uploaded||track.publishedAt
  const date=time>0&&time<=Date.now()?{label:uploaded?'Uploaded':'Published on SoundCloud',time}:null
  return {...track,title:track.listedTitle||track.title,artistProfile:profile,date,art:track.listedArt||track.art||'',
    genres:genres.filter(genre=>genreMatches(track,genre))}
}

function byUploadDate(a,b){
  return (b.date?.time||0)-(a.date?.time||0)
}

function decodeListing(value){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(entity,name)=>{
    if(name[0]!=='#')return named[name]||entity
    const point=name[1]?.toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1))
    return point>0&&point<=0x10ffff?String.fromCodePoint(point):entity
  })
}

function publicProfileUploads(html,profile){
  const listing=html.match(/<noscript>([\s\S]*?)<\/noscript>/i)?.[1]
  if(!listing)return null
  const link=/<h1\b[^>]*>\s*<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h1>/i.exec(listing)
  if(!link)return null
  const owner=soundCloudProfile(new URL(decodeListing(link[1]),profile).href)
  if(owner!==profile)return null
  const rows=[]
  for(const recording of listing.matchAll(/<article\b(?=[^>]*\bitemprop=["']track["'])(?=[^>]*\bitemtype=["']https?:\/\/schema\.org\/MusicRecording["'])[^>]*>([\s\S]*?)<\/article>/gi)){
    const block=recording[1]
    const anchor=/<a\b[^>]*\bitemprop=["']url["'][^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block)
    const url=anchor&&trackURL(new URL(decodeListing(anchor[1]),profile).href)
    if(!url||soundCloudProfile(profileURL({url}))!==profile)continue
    const duration=/itemprop=["']duration["']\s+content=["']PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?["']/i.exec(block)
    const published=/<time\b[^>]*\bpubdate[^>]*>([^<]+)<\/time>/i.exec(block)?.[1]
    const milliseconds=duration?(Number(duration[1]||0)*3600+Number(duration[2]||0)*60+Number(duration[3]||0))*1000:undefined
    const genre=/itemprop=["']genre["']\s+content=["']([^"']+)["']/i.exec(block)?.[1]
    rows.push({url,title:decodeListing(anchor[2].replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim(),
      artist:decodeListing(link[2]),uploaderProfile:owner,listedGenre:genre?decodeListing(genre):undefined,
      publishedAt:Date.parse(published),publicDuration:milliseconds})
  }
  return rows
}

function favouriteStatus({found,accepted,network,unreadable,metadata,timeout,identity,empty}){
  if(identity)return 'identity'
  if(timeout||network)return accepted?'partial':'network'
  if(unreadable||metadata)return accepted?'partial':'parse'
  if(accepted)return 'ready'
  return found||empty?'empty':'parse'
}

function mergeFavouriteCheck(previous,{rows,status},checkedAt){
  if(status==='ready'||status==='empty')return {rows,status,checkedAt,lastSuccessful:checkedAt}
  const retained=[...new Map([...(previous.rows||[]),...rows].map(track=>[track.url,track])).values()]
    .sort(byUploadDate).slice(0,8)
  return {rows:retained,status,checkedAt,lastSuccessful:previous.lastSuccessful||null}
}

module.exports={soundCloudProfile,verifiedUpload,byUploadDate,favouriteStatus,mergeFavouriteCheck,publicProfileUploads}
