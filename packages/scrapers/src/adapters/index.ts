import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { himalayasAdapter } from './himalayas';
import { hnAdapter } from './hn';
import { joobleAdapter } from './jooble';
import { remoteokAdapter } from './remoteok';
import { remotiveAdapter } from './remotive';
import { robotauaAdapter } from './robotaua';
import { wwrAdapter } from './wwr';

// Partial until the new adapters land (Plan 3 Tasks 2-5).
export const ADAPTERS: Partial<Record<SourceId, SourceAdapter>> = {
  dou: douAdapter,
  djinni: djinniAdapter,
  robotaua: robotauaAdapter,
  jooble: joobleAdapter,
  remoteok: remoteokAdapter,
  remotive: remotiveAdapter,
  himalayas: himalayasAdapter,
  wwr: wwrAdapter,
  hn: hnAdapter,
};
