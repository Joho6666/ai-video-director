import { runMotionAblationBenchmark } from '../packages/benchmark/ablation';
const result = await runMotionAblationBenchmark();
console.log(result.report);
console.log(`MOTION_ABLATION = ${result.status}`);
