import path from 'node:path';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
export const skillRoot=process.env.DIRECTOR_SKILL_PATH||path.join(os.homedir(),'.codex','skills','ai-commercial-video-director');
export async function loadSkill(){
 const files=['SKILL.md','prompts/reference-analyzer.md','prompts/shot-dna-and-variation.md','prompts/human-performance.md','prompts/motion-continuity.md','prompts/prompt-compiler.md','schemas/output.schema.json','schemas/shot-dna.schema.json','schemas/performance-timeline.schema.json'];
 const contents=await Promise.all(files.map(f=>readFile(path.join(skillRoot,f),'utf8')));
 const text=contents.map((s,i)=>`\n--- ${files[i]} ---\n${s}`).join('\n');
 const ajv=new Ajv2020({allErrors:true,strict:false});
 ajv.addSchema(JSON.parse(contents[7]));ajv.addSchema(JSON.parse(contents[8]));const validate=ajv.compile(JSON.parse(contents[6]));
 return {text,sha256:createHash('sha256').update(text).digest('hex'),validate};
}
