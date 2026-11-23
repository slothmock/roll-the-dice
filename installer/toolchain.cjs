const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const version='5.0.2';
const packages=[
 {name:'wix',sha256:'f30ef0c74e2a986126539c5780be93ac24e8136eaf723b1937b26272703ae173'},
 {name:'wixtoolset.ui.wixext',sha256:'5ef2c707614b9f70b6bbadd2d4abcb4124efee215e9b16bfbc80113079a604c7'}
].map(p=>({...p,url:'https://api.nuget.org/v3-flatcontainer/'+p.name+'/'+version+'/'+p.name+'.'+version+'.nupkg'}));
function validateArchive(bytes,expected){
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Installer compiler download checksum mismatch.');
 return true;
}
const quote=value=>"'"+value.split("'").join("''")+"'";
async function ensureWix(cacheDir){
 fs.mkdirSync(cacheDir,{recursive:true});
 const stage=fs.mkdtempSync(path.join(cacheDir,'toolchain-'));
 try{
  for(const p of packages){
   const archive=path.join(cacheDir,p.name+'-'+version+'.zip');
   if(!fs.existsSync(archive)){
    const response=await fetch(p.url,{signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw Error('Could not download installer compiler: HTTP '+response.status);
    const bytes=Buffer.from(await response.arrayBuffer());validateArchive(bytes,p.sha256);
    const temporary=path.join(stage,p.name+'.zip');fs.writeFileSync(temporary,bytes);fs.renameSync(temporary,archive);
   }
   validateArchive(fs.readFileSync(archive),p.sha256);
   const destination=path.join(stage,p.name);
   const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath "+quote(archive)+' -DestinationPath '+quote(destination)],{stdio:'inherit'});
   if(result.error||result.status!==0)throw Error('Could not extract the pinned installer compiler.');
  }
  return {directory:stage,wix:path.join(stage,'wix/tools/net6.0/any/wix.dll'),ui:path.join(stage,'wixtoolset.ui.wixext/wixext5/WixToolset.UI.wixext.dll')};
 }catch(error){fs.rmSync(stage,{recursive:true,force:true});throw error;}
}
module.exports={version,packages,validateArchive,ensureWix};
