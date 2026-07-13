export const PARTICIPANT_IDENTITY_QUERY_KEY = 'identity';

export type ParticipantIdentity = 'guest' | 'changzhang';

const CHANGZHANG_IDENTITY: ParticipantIdentity = 'changzhang';
const GUEST_IDENTITY: ParticipantIdentity = 'guest';

export function normalizeParticipantIdentity(value: unknown): ParticipantIdentity {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === CHANGZHANG_IDENTITY ? CHANGZHANG_IDENTITY : GUEST_IDENTITY;
}

export function getParticipantIdentityFromSearch(search: string): ParticipantIdentity {
  const searchParams = new URLSearchParams(search);
  return normalizeParticipantIdentity(searchParams.get(PARTICIPANT_IDENTITY_QUERY_KEY));
}
