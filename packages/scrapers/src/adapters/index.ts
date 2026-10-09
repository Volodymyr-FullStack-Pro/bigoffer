import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { adzunaAdapter } from './adzuna';
import { arbeitnowAdapter } from './arbeitnow';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { himalayasAdapter } from './himalayas';
import { hnAdapter } from './hn';
import { itleadAdapter } from './itlead';
import { jobicoAdapter } from './jobico';
import { jobicyAdapter } from './jobicy';
import { joobleAdapter } from './jooble';
import { linkedinAdapter } from './linkedin';
import { olxAdapter } from './olx';
import { justjoinAdapter } from './justjoin';
import { remoteokAdapter } from './remoteok';
import { remotiveAdapter } from './remotive';
import { robotauaAdapter } from './robotaua';
import { ashbyAdapter } from './ashby';
import { greenhouseAdapter } from './greenhouse';
import { leverAdapter } from './lever';
import { telegramAdapter } from './telegram';
import { workableAdapter } from './workable';
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
  jobico: jobicoAdapter,
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  workable: workableAdapter,
  telegram: telegramAdapter,
  adzuna: adzunaAdapter,
  itlead: itleadAdapter,
};
