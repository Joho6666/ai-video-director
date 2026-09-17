import type { Task } from '../shared/types';
import { WorkflowStateManager } from './state';
import { WorkflowScheduler, type SchedulerOptions } from './scheduler';
import { runPiProduction } from '../pi-runtime/workflow';

export class VideoProductionWorkflow {
  static async run(task: Task, options: SchedulerOptions = {}): Promise<Task> {
    const stateManager = await WorkflowStateManager.load(task.id, task.appMode);

    try {
      if (task.appMode === 'full' && !options.skipPi) {
        await runPiProduction(task, stateManager, options);
      } else {
        await new WorkflowScheduler().run(task, stateManager, options);
      }
      return task;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workflow failed';
      stateManager.setError(msg);
      await stateManager.persist();
      throw error;
    }
  }
}
