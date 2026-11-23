const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {ensureWix,version:toolVersion}=require('../installer/toolchain.cjs');
const upgradeCode='21039AA8-D241-41CE-8177-54D28426EC7F';
function run(command,args,options={}){
 const result=spawnSync(command,args,{stdio:'inherit',...options});
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(command+' failed with exit code '+result.status);
}
(async()=>{
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build this x64 Windows installer on x64 Windows.');
 const root=path.resolve(__dirname,'..'),portable=path.join(root,'build');
 const {createInstaller}=require('../installer/generate.cjs');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8'));
 const {extractFile,listPackage,statFile}=await import('@electron/asar');
 const archive=path.join(portable,'resources/app.asar');let verified=0;
 function sourceMatches(folder){
  for(const item of fs.readdirSync(folder,{withFileTypes:true})){
   const file=path.join(folder,item.name);
   if(item.isDirectory())sourceMatches(file);
   else{
    const key=path.relative(path.join(root,'app'),file).split(path.sep).join('/');
    if(!extractFile(archive,key).equals(fs.readFileSync(file)))throw Error('Portable build is stale: '+key+'. Rebuild it before creating an installer.');
    verified++;
   }
  }
 }
 sourceMatches(path.join(root,'app'));
 const packagedFiles=listPackage(archive).map(name=>{
  name=name.split(String.fromCharCode(92)).join('/');
  while(name.startsWith('/'))name=name.slice(1);
  return name;
 }).filter(name=>!statFile(archive,name).files);
 if(packagedFiles.length!==verified)throw Error('Portable archive has unexpected files. Rebuild it before creating an installer.');
 run('uvx',['--from','castlabs-evs','evs-vmp','--no-ask','verify-pkg',portable]);
 const generated=createInstaller({portableDir:portable,iconPath:path.join(root,'app/assets/app.ico'),version:pkg.version,upgradeCode});
 const output=path.join(root,'dist');fs.mkdirSync(output,{recursive:true});
 const work=fs.mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'roll-dice-msi-'));
 let tools;
 try{
  tools=await ensureWix(path.join(root,'.installer-tools'));
  const source=path.join(work,'Package.wxs');fs.writeFileSync(source,generated.xml);
  const filename='Roll-the-Dice-'+pkg.version+'-x64.msi',built=path.join(work,filename);
  run('dotnet',[tools.wix,'build',source,path.join(root,'installer/SetupUI.wxs'),'-arch','x64','-ext',tools.ui,'-pdbtype','none','-out',built],{env:{...process.env,DOTNET_ROLL_FORWARD:'Major'}});
  for(const file of generated.files){
   const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(portable,...file.path.split('/')))).digest('hex');
   if(actual!==file.sha256)throw Error('Portable payload changed during packaging: '+file.path);
  }
  const bytes=fs.readFileSync(built),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const manifest={product:'Roll the Dice',version:pkg.version,msiVersion:generated.msiVersion,upgradeCode,wixVersion:toolVersion,architecture:'x64',scope:'perUser',defaultInstallDirectory:'%LOCALAPPDATA%/Programs/Roll the Dice',preservesLibraryOnUninstall:true,sourceAppFilesVerified:verified,files:generated.files,installer:{filename,sha256,size:bytes.length}};
  const manifestPath=path.join(work,'installer-manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  const stagedOutput=path.join(output,filename+'.partial');
  fs.copyFileSync(built,stagedOutput);fs.renameSync(stagedOutput,path.join(output,filename));
  fs.copyFileSync(manifestPath,path.join(output,'installer-manifest.json'));
  fs.writeFileSync(path.join(output,filename+'.sha256'),sha256+'  '+filename+'\n');
  console.log('Built MSI:',path.join(output,filename));console.log('Payload files:',generated.files.length);console.log('SHA-256:',sha256);
 }finally{
  if(tools)fs.rmSync(tools.directory,{recursive:true,force:true});
  fs.rmSync(work,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
