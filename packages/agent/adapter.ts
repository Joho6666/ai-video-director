import type { Task, Plan } from '../shared/types';
import { mockTreatment } from '../director/mock';
import { compileTreatment, mockSupplements } from '../director';

export interface AgentAdapter { plan(task:Task):Promise<{plan:Plan;treatment:unknown}> }
export class MockAgentAdapter implements AgentAdapter {
  async plan(task:Task){ const treatment=mockTreatment(task); return compileTreatment(task,treatment,mockSupplements(),'mock'); }
}
/** Pi is intentionally a strict boundary: configure the model before paid/live runs. */
export class PiAgentAdapter implements AgentAdapter {
  async plan(_task:Task):Promise<{plan:Plan;treatment:unknown}> {
    throw new Error('Pi Director 尚未配置可用的视觉模型。请设置 DIRECTOR_API_KEY、DIRECTOR_BASE_URL、DIRECTOR_MODEL；离线验证请使用 DIRECTOR_MODE=mock。');
  }
}
