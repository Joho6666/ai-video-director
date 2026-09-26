import type { ReferenceSourceProvider, ReferenceVideo } from '../types';
export class RedFoxProvider implements ReferenceSourceProvider {
  async resolve(): Promise<ReferenceVideo> { throw new Error('RedFox Provider 尚未实现'); }
  async search(): Promise<ReferenceVideo[]> { throw new Error('RedFox Provider 尚未实现'); }
}
