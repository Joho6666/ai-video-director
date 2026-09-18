import type { Task } from '../shared/types';
import { WorkflowStateManager } from './state';
import { WorkflowScheduler, type SchedulerOptions } from './scheduler';
import { runPiProduction } from '../pi-runtime/workflow';

export class VideoProductionWorkflow {
  static async run(task: Task, options: SchedulerOptions = {}): Promise<Task> {
    const stateManager = await WorkflowStateManager.load(task.id, task.appMode);

    try {
      // A crash after Director planning but before the generation ledger is
      // written has not submitted a paid provider task. Resume that durable
      // checkpoint instead of leaving the UI indefinitely in "planning".
      if (task.appMode === 'full' && task.plan && !task.generationTasks?.length && stateManager.currentStatus === 'FAILED') {
        stateManager.resumePlanning();
        await stateManager.persist();
      }
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
