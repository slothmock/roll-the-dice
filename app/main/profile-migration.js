const path=require('node:path')

// Deliberately migrate only library files, never Chromium sessions or credentials.
// fs is explicit so bootstrap fixtures cannot accidentally inspect a real profile.
module.exports=function migrateLibrary({fs,appData,profile}){
  let staging
  try{
    try{fs.lstatSync(profile);return}
    catch(error){if(error.code!=='ENOENT')throw error}
    const source=path.join(appData,'roll-the-dice-faithful-clone')
    const files=['crate.json','crate.json.bak'].filter(name=>{
      try{
        if(!fs.lstatSync(path.join(source,name)).isFile())throw Error('Not a regular library file')
        return true
      }
      catch(error){if(error.code==='ENOENT')return false;throw error}
    })
    if(!files.length)return
    fs.mkdirSync(path.dirname(profile),{recursive:true})
    staging=fs.mkdtempSync(path.join(path.dirname(profile),'.library-migration-'))
    for(const name of files){
      fs.copyFileSync(path.join(source,name),path.join(staging,name),fs.constants.COPYFILE_EXCL)
    }
    // Another launcher may have created the destination while we copied.
    let destinationExists=false
    try{fs.lstatSync(profile);destinationExists=true}
    catch(error){if(error.code!=='ENOENT')throw error}
    if(destinationExists)throw Error('Destination appeared during migration')
    fs.renameSync(staging,profile)
    staging=undefined
  }catch{
    throw Error('Library migration could not be completed. Your previous library has not been changed. Restart to retry.')
  }finally{
    if(staging){
      // A failed cleanup leaves only an unreferenced staging directory; retry
      // uses a fresh one and never treats staging as the active profile.
      try{fs.rmSync(staging,{recursive:true,force:true})}catch{}
    }
  }
}
