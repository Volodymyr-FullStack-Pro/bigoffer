export type SavedLink = { id: string; url: string; title: string; topic: string; note: string | null; createdAt: string };

/** Suggested topics; any other short name is fine too. */
export const TOPIC_SUGGESTIONS = ['JavaScript', 'TypeScript', 'React', 'Next.js', 'Node.js', 'Databases', 'CSS', 'Algorithms', 'System design', 'Testing', 'DevOps', 'AI', 'Career', 'English'] as const;

export function cleanTopic(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Other';
}
