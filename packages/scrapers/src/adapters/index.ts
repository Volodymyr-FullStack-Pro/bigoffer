import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { robotauaAdapter } from './robotaua';

export const ADAPTERS: Record<SourceId, SourceAdapter> = {
  dou: douAdapter,
  djinni: djinniAdapter,
  robotaua: robotauaAdapter,
};
