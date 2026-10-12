import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { himalayasAdapter } from './himalayas';
import { hnAdapter } from './hn';
import { itleadAdapter } from './itlead';
import { joobleAdapter } from './jooble';
import { linkedinAdapter } from './linkedin';
import { remoteokAdapter } from './remoteok';
import { remotiveAdapter } from './remotive';
import { robotauaAdapter } from './robotaua';
import { ashbyAdapter } from './ashby';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';
import { telegramAdapter } from './telegram';
import { workableAdapter } from './workable';
import { workingnomadsAdapter } from './workingnomads';

export const ADAPTERS: Record<SourceId, SourceAdapter> = {
  dou: douAdapter,
  djinni: djinniAdapter,
  robotaua: robotauaAdapter,
  jooble: joobleAdapter,
  remoteok: remoteokAdapter,
  remotive: remotiveAdapter,
  himalayas: himalayasAdapter,
  hn: hnAdapter,
  workingnomads: workingnomadsAdapter,
  linkedin: linkedinAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  workable: workableAdapter,
  telegram: telegramAdapter,
  itlead: itleadAdapter,
};
