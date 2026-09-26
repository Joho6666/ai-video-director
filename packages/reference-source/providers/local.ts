import type { Asset } from '../../shared/types';
import type { ReferenceVideo } from '../types';
export function localReferenceFromAsset(asset: Asset, id: string): ReferenceVideo {
  if (asset.kind !== 'reference') throw new Error('需要 reference 类型素材');
  return { id, platform:'local', provider:'local', sourceUrl:asset.file, localFile:asset.file };
}
