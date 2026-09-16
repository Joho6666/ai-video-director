import {readTask} from '../packages/shared/storage';
import {runTask} from '../packages/agent/runner';
process.loadEnvFile('.env.local');
const id=process.argv[2];if(!id)throw new Error('Usage: npm run production-resume -- <task-id>');
const task=await readTask(id);
if(!task.plan||!task.generationTasks?.length)throw new Error('Resume requires saved plan and generation records');
if(task.appMode==='director')throw new Error('Cannot resume video production for director-only task');
await runTask(task);const result=await readTask(id);console.log(result.status);if(result.status!=='COMPLETED')process.exitCode=1;
