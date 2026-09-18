import { runRetryBenchmark } from '../packages/benchmark/retry';
const result = await runRetryBenchmark();
console.log(result.report);
console.log(`RETRY_BENCHMARK = ${result.status}`);
