import type { Task, Plan } from '../shared/types';
import { mockTreatment } from '../director/mock';
import { compileTreatment, mockSupplements } from '../director';

export interface AgentAdapter { plan(task:Task):Promise<{plan:Plan;treatment:unknown}> }
export class MockAgentAdapter implements AgentAdapter {
  async plan(task:Task){ const treatment=mockTreatment(task); return compileTreatment(task,treatment,mockSupplements(),'mock'); }
}
