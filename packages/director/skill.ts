import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';

export function resolveSkillRoot(): string {
  if (process.env.DIRECTOR_SKILL_PATH && existsSync(process.env.DIRECTOR_SKILL_PATH)) {
    return process.env.DIRECTOR_SKILL_PATH;
  }
  // 1. Repo bundled skills directory relative to process.cwd()
  const cwdBundled = path.resolve(process.cwd(), 'skills', 'ai-commercial-video-director');
  if (existsSync(path.join(cwdBundled, 'SKILL.md'))) {
    return cwdBundled;
  }
  // 2. Repo bundled skills directory relative to this module file
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const relativeBundled = path.resolve(currentDir, '../../skills', 'ai-commercial-video-director');
    if (existsSync(path.join(relativeBundled, 'SKILL.md'))) {
      return relativeBundled;
    }
  } catch {}
  // 3. User home directory fallback (~/.codex/skills/...)
  const homeSkills = path.join(os.homedir(), '.codex', 'skills', 'ai-commercial-video-director');
  if (existsSync(path.join(homeSkills, 'SKILL.md'))) {
    return homeSkills;
  }
  return cwdBundled;
}

export const skillRoot = resolveSkillRoot();

export async function loadSkill(){
 const root = resolveSkillRoot();
 const files=['SKILL.md','prompts/reference-analyzer.md','prompts/shot-dna-and-variation.md','prompts/human-performance.md','prompts/motion-continuity.md','prompts/prompt-compiler.md','schemas/output.schema.json','schemas/shot-dna.schema.json','schemas/performance-timeline.schema.json'];
 const contents=await Promise.all(files.map(f=>readFile(path.join(root,f),'utf8')));
 const text=contents.map((s,i)=>`\n--- ${files[i]} ---\n${s}`).join('\n');
 const ajv=new Ajv2020({allErrors:true,strict:false});
 ajv.addSchema(JSON.parse(contents[7]));ajv.addSchema(JSON.parse(contents[8]));const validate=ajv.compile(JSON.parse(contents[6]));
 return {text,sha256:createHash('sha256').update(text).digest('hex'),validate};
}
