import type { Task } from '../shared/types';
import { WorkflowStateManager } from './state';
import { WorkflowScheduler, type SchedulerOptions } from './scheduler';

export class VideoProductionWorkflow {
  static async run(task: Task, options: SchedulerOptions = {}): Promise<Task> {
    const stateManager = await WorkflowStateManager.load(task.id, task.appMode);
    const scheduler = new WorkflowScheduler();

    try {
      await scheduler.run(task, stateManager, options);
      return task;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Workflow failed';
      stateManager.setError(msg);
      await stateManager.persist();
      throw error;
    }
  }
}
