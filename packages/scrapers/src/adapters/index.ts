import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { arbeitnowAdapter } from './arbeitnow';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { himalayasAdapter } from './himalayas';
import { hnAdapter } from './hn';
import { jobicyAdapter } from './jobicy';
import { joobleAdapter } from './jooble';
import { justjoinAdapter } from './justjoin';
import { remoteokAdapter } from './remoteok';
import { remotiveAdapter } from './remotive';
import { robotauaAdapter } from './robotaua';
import { workingnomadsAdapter } from './workingnomads';
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
  arbeitnow: arbeitnowAdapter,
  jobicy: jobicyAdapter,
  workingnomads: workingnomadsAdapter,
  justjoin: justjoinAdapter,
};
