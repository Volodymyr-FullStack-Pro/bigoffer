/** Window events other components send to the Offer Genie. */
export type GenieEvent =
  | { type: 'applied' | 'saved' | 'offer' }
  | { type: 'hint'; key: string; params?: Record<string, string | number>; action?: { href: string; labelKey: string } }
  | { type: 'clearHint' };

export const GENIE_EVENT = 'bigoffer:genie';

export function tellGenie(event: GenieEvent): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<GenieEvent>(GENIE_EVENT, { detail: event }));
}
