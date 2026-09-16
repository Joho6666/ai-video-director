import { access,readFile,readdir,stat } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { startServer,stopServer,submit } from './test-server';
import { projectDir } from '../packages/shared/storage';
import { EXPORT_FILES } from '../packages/shared/exports';
import { planSchema } from '../packages/shared/types';
import { referenceEvidenceSchema } from '../packages/agent/deepseek';

try{const local=await readFile(path.join(process.cwd(),'.env.local'),'utf8');for(const line of local.split(/\r?\n/)){const match=/^([A-Z0-9_]+)=(.*)$/.exec(line.trim());if(match&&process.env[match[1]]===undefined)process.env[match[1]]=match[2];}}catch{}
if(!process.env.DEEPSEEK_API_KEY){console.log('UNAVAILABLE: DEEPSEEK_API_KEY missing');process.exit(0);}
const pairs=process.argv.slice(2).map((v,i,a)=>v.startsWith('--')?[v.slice(2),a[i+1]]:null).filter(Boolean) as [string,string][];const args=Object.fromEntries(pairs);
const defaults=path.resolve(process.cwd(),'..','..','work','test-assets');const reference=args.reference||path.join(defaults,'reference_8s.mp4');const model=args.model||path.join(defaults,'model.jpg');const product=args.product||path.join(defaults,'product.jpg');
for(const file of [reference,model,product])await access(file);
const server=await startServer({APP_MODE:'director'});
try{
 const {id,state}=await submit(server.base,reference,model,product,args.requirement||'参考真人街拍，设计三套动作自然、像穿搭博主展示商品的广告导演方案。');const root=projectDir(id);
 for(const file of ['reference-evidence.json','director-output.json','generation-plan.json','deepseek-request.json','runtime.json','exports/creative-package.zip'])if((await stat(path.join(root,file))).size<=0)throw new Error(`${file} missing`);
 const request=JSON.parse(await readFile(path.join(root,'deepseek-request.json'),'utf8'));const runtime=JSON.parse(await readFile(path.join(root,'runtime.json'),'utf8'));const plan=planSchema.parse(JSON.parse(await readFile(path.join(root,'generation-plan.json'),'utf8')));referenceEvidenceSchema.parse(JSON.parse(await readFile(path.join(root,'reference-evidence.json'),'utf8')));
 if(runtime.app_mode!=='director'||runtime.video_provider!==null)throw new Error('runtime is not director-only');if(plan.mode!=='live')throw new Error('plan is not live');if((state as {results?:unknown[]}).results?.length)throw new Error('director mode created video results');
 if(request.model!==(process.env.DEEPSEEK_MODEL||'deepseek-flash'))throw new Error(`unexpected model ${request.model}`);if(!request.id||!request.usage||request.frame_count<16||request.image_count!==request.frame_count+3)throw new Error('DeepSeek request metadata incomplete');
 const resultsDir=path.join(root,'results');if(await access(resultsDir).then(()=>true).catch(()=>false))throw new Error('director mode created results directory');
 const zip=await JSZip.loadAsync(await readFile(path.join(root,'exports','creative-package.zip')));const entries=Object.keys(zip.files).sort();if(JSON.stringify(entries)!==JSON.stringify([...EXPORT_FILES].sort()))throw new Error(`unsafe ZIP entries: ${entries.join(',')}`);
 const exportFiles=(await readdir(path.join(root,'exports'))).sort();if(exportFiles.length!==8)throw new Error('unexpected export files');
 console.log(`PASS director-smoke task=${id} model=${request.model} frames=${request.frame_count} images=${request.image_count} variants=${plan.variants.length}`);
}finally{stopServer(server.child);}
