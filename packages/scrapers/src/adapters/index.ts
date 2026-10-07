import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { arbeitnowAdapter } from './arbeitnow';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { himalayasAdapter } from './himalayas';
import { hnAdapter } from './hn';
import { jobicyAdapter } from './jobicy';
import { joobleAdapter } from './jooble';
import { linkedinAdapter } from './linkedin';
import { olxAdapter } from './olx';
import { justjoinAdapter } from './justjoin';
import { remoteokAdapter } from './remoteok';
import { remotiveAdapter } from './remotive';
import { robotauaAdapter } from './robotaua';
import { workingnomadsAdapter } from './workingnomads';
import { workuaAdapter } from './workua';
import { wwrAdapter } from './wwr';

export const ADAPTERS: Record<SourceId, SourceAdapter> = {
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
  linkedin: linkedinAdapter,
  workua: workuaAdapter,
  olx: olxAdapter,
};
