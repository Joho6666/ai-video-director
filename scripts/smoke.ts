import { mkdir,readFile,stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ffmpeg,mediaExec } from '../packages/video-analysis';
import { projectDir } from '../packages/shared/storage';
import { startServer,stopServer,submit } from './test-server';
const temp=path.join(os.tmpdir(),`ai-video-director-smoke-${Date.now()}`);await mkdir(temp,{recursive:true});const reference=path.join(temp,'reference.mp4'),model=path.join(temp,'model.jpg'),product=path.join(temp,'product.jpg');
await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=360x640:rate=24','-t','8','-pix_fmt','yuv420p',reference]);for(const [file,color] of [[model,'salmon'],[product,'black']])await mediaExec(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`color=c=${color}:size=640x640`,'-frames:v','1',file]);
const server=await startServer({APP_MODE:'mock'});try{const {id}=await submit(server.base,reference,model,product);const root=projectDir(id);const required=['reference/metadata.json','reference/frames.json','reference/contact-sheet.jpg','generation-plan.json','runtime.json','exports/creative-package.zip','results/V1.mp4','results/V2.mp4','results/V3.mp4'];for(const file of required)if((await stat(path.join(root,file))).size<=0)throw new Error(`${file} missing or empty`);const metadata=JSON.parse(await readFile(path.join(root,'reference/metadata.json'),'utf8'));const frames=JSON.parse(await readFile(path.join(root,'reference/frames.json'),'utf8'));if(metadata.frameCount!==frames.length||frames.length!==16)throw new Error('frame manifest mismatch');console.log(`PASS smoke task=${id} frames=${frames.length} results=3`);}finally{stopServer(server.child);}
