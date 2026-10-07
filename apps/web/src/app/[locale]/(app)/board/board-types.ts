import type { Urgency } from '@jp/core';

export type BoardColumn = { id: string; key: string; title: string; kind: 'active' | 'won' | 'lost' };
export type BoardLabel = { id: string; key: string | null; name: string | null; color: string };

export type BoardCard = {
  id: string;
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
};

export type BoardCardView = BoardCard & { urgency: Urgency };
