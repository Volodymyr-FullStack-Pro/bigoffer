import type { Urgency } from '@jp/core';
import type { ReplyKind } from './reply-kinds';

export type BoardColumn = { id: string; key: string; title: string; kind: 'active' | 'won' | 'lost' };
export type BoardLabel = { id: string; key: string | null; name: string | null; color: string };

export type BoardCard = {
  id: string;
  jobId: string | null;
  columnId: string;
  rank: string;
  title: string;
  company: string;
  url: string | null;
  sourceId: string | null;
  salary: string | null;
  notes: string | null;
  contactName: string | null;
  contactUrl: string | null;
  appliedAt: string | null;
  nextActionAt: string | null;
  firstResponseAt: string | null;
  lastActivityAt: string | null;
  followUpCount: number;
  outcome: string;
  labelIds: string[];
  /** What the latest recruiter reply was; null until one is logged. */
  replyKind: ReplyKind | null;
  /** The latest logged message (who spoke last decides whose move it is). */
  lastMessage: { direction: 'in' | 'out'; at: string } | null;
};

export type BoardCardView = BoardCard & { urgency: Urgency };
