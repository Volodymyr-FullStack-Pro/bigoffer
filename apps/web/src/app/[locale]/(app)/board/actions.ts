'use server';

import type { Json } from '@jp/db';
import { type ApplicationPatch, applicationPatchSchema, rankAtTop, type RejectionInput, rejectionInputSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUserId } from '@/lib/auth';
import { fetchJobPreview, type JobPreview } from '@/lib/job-preview';
import { createClient } from '@/lib/supabase/server';
import type { BoardCard, BoardLabel } from './board-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANK = /^[0-9A-Za-z]{1,64}$/;

async function client() {
  return (await getUserId()) ? createClient() : null;
}

function done(error: { message: string } | null, what: string): boolean {
  if (error) console.error(`${what} failed`, error.message);
  revalidatePath('/[locale]/board', 'page');
  return !error;
}

async function event(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string, type: string, payload: { [key: string]: Json | undefined } = {}) {
  const userId = await getUserId();
  await supabase.from('application_events').insert({ application_id: applicationId, user_id: userId!, type, payload });
}

export async function moveApplication(id: string, columnId: string, rank: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id) || !UUID.test(columnId) || !RANK.test(rank)) return false;
  const { error } = await supabase.rpc('move_application', { p_id: id, p_column_id: columnId, p_rank: rank });
  return done(error, 'moveApplication');
}

export async function rejectApplication(id: string, columnId: string, rank: string, input: RejectionInput): Promise<boolean> {
  const supabase = await client();
  const parsed = rejectionInputSchema.safeParse(input);
  if (!supabase || !parsed.success || !UUID.test(id) || !UUID.test(columnId) || !RANK.test(rank)) return false;
  const { error } = await supabase.rpc('reject_application', {
    p_id: id,
    p_column_id: columnId,
    p_rank: rank,
    p_stage: parsed.data.stage,
    p_by: parsed.data.by,
    p_reasons: parsed.data.reasons,
    p_note: parsed.data.note,
  });
  return done(error, 'rejectApplication');
}

export async function updateApplication(id: string, patch: ApplicationPatch): Promise<boolean> {
  const supabase = await client();
  const parsed = applicationPatchSchema.safeParse(patch);
  if (!supabase || !parsed.success || !UUID.test(id)) return false;
  const p = parsed.data;
  const { error } = await supabase
    .from('applications')
    .update({
      salary: p.salary || null,
      notes: p.notes || null,
      next_action_at: p.nextActionAt,
      contact: { ...(p.contactName ? { name: p.contactName } : {}), ...(p.contactUrl ? { url: p.contactUrl } : {}) },
    })
    .eq('id', id);
  if (!error && p.notes) await event(supabase, id, 'note');
  return done(error, 'updateApplication');
}

export async function setApplicationLabel(id: string, labelId: string, on: boolean): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id) || !UUID.test(labelId)) return false;
  const { error } = on
    ? await supabase.from('application_labels').upsert({ application_id: id, label_id: labelId }, { ignoreDuplicates: true })
    : await supabase.from('application_labels').delete().eq('application_id', id).eq('label_id', labelId);
  if (!error) await event(supabase, id, 'label', { labelId, on });
  return done(error, 'setApplicationLabel');
}

export async function createLabel(name: string, color: string): Promise<BoardLabel | null> {
  const supabase = await client();
  const trimmed = name.trim();
  if (!supabase || !trimmed || trimmed.length > 40 || !/^#[0-9A-Fa-f]{6}$/.test(color)) return null;
  const userId = await getUserId();
  const { data, error } = await supabase.from('labels').insert({ user_id: userId!, name: trimmed, color }).select('id, key, name, color').single();
  if (error) console.error('createLabel failed', error.message);
  revalidatePath('/[locale]/board', 'page');
  return data ?? null;
}

export async function markPinged(id: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return false;
  const { data } = await supabase.from('applications').select('follow_up_count').eq('id', id).maybeSingle();
  if (!data) return false;
  const { error } = await supabase
    .from('applications')
    .update({ follow_up_count: data.follow_up_count + 1, last_activity_at: new Date().toISOString() })
    .eq('id', id);
  if (!error) await event(supabase, id, 'follow_up_sent', { count: data.follow_up_count + 1 });
  return done(error, 'markPinged');
}

export async function markResponse(id: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return false;
  const now = new Date().toISOString();
  const { error } = await supabase.from('applications').update({ first_response_at: now, last_activity_at: now }).eq('id', id);
  if (!error) await event(supabase, id, 'response');
  return done(error, 'markResponse');
}

export async function deleteApplication(id: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return false;
  const { error } = await supabase.from('applications').delete().eq('id', id);
  return done(error, 'deleteApplication');
}

export async function getApplicationEvents(id: string): Promise<{ type: string; payload: unknown; createdAt: string }[]> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return [];
  const { data } = await supabase
    .from('application_events')
    .select('type, payload, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []).map((e) => ({ type: e.type, payload: e.payload, createdAt: e.created_at }));
}

const previewUrlSchema = z.string().max(2000);
const createInputSchema = z.object({
  columnId: z.string().regex(UUID),
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().max(200),
  url: z.string().trim().max(2000).regex(/^https?:\/\//i).nullable(),
  location: z.string().trim().max(200).nullable(),
  salary: z.string().trim().max(120).nullable(),
});

export async function previewJob(url: string): Promise<JobPreview | null> {
  const parsed = previewUrlSchema.safeParse(url);
  if (!parsed.success || !(await getUserId())) return null;
  return fetchJobPreview(parsed.data);
}

export async function createApplication(raw: {
  columnId: string;
  title: string;
  company: string;
  url: string | null;
  location: string | null;
  salary: string | null;
}): Promise<BoardCard | null> {
  const supabase = await client();
  const userId = await getUserId();
  const parsed = createInputSchema.safeParse({ ...raw, url: raw.url?.trim() || null });
  if (!supabase || !userId || !parsed.success) return null;
  const input = { ...parsed.data, location: parsed.data.location || null, salary: parsed.data.salary || null };
  const { title, url } = input;
  const { data: col } = await supabase.from('board_columns').select('key, kind').eq('id', input.columnId).maybeSingle();
  if (!col || col.kind !== 'active') return null;
  const { data: first } = await supabase.from('applications').select('rank').eq('column_id', input.columnId).order('rank').limit(1).maybeSingle();
  const appliedAt = col.key === 'applied' ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      column_id: input.columnId,
      rank: rankAtTop(first?.rank ?? null),
      title,
      company: input.company,
      url,
      location: input.location,
      salary: input.salary,
      applied_at: appliedAt,
    })
    .select('id, rank')
    .single();
  if (error || !data) {
    if (error) console.error('createApplication failed', error.message);
    return null;
  }
  await event(supabase, data.id, 'created', { from: 'manual' });
  revalidatePath('/[locale]/board', 'page');
  return {
    id: data.id, columnId: input.columnId, rank: data.rank, title, company: input.company, url,
    sourceId: null, salary: input.salary, notes: null, contactName: null, contactUrl: null,
    appliedAt, nextActionAt: null, firstResponseAt: null, lastActivityAt: null, followUpCount: 0, outcome: 'open', labelIds: [],
  };
}
