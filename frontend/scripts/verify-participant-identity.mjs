import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const identitySource = await readFile(new URL('../src/lib/participantIdentity.ts', import.meta.url), 'utf8');
const streamSource = await readFile(new URL('../src/lib/agentStreamClient.ts', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(identitySource, /PARTICIPANT_IDENTITY_QUERY_KEY\s*=\s*['"]identity['"]/);
assert.match(identitySource, /normalized === CHANGZHANG_IDENTITY/);
assert.match(identitySource, /CHANGZHANG_IDENTITY\s*:\s*GUEST_IDENTITY/);
assert.match(streamSource, /participant_identity\?: ParticipantIdentity/);
assert.match(streamSource, /participant_identity\s*=\s*handlers\.participantIdentity/);
assert.match(appSource, /getParticipantIdentityFromSearch\(window\.location\.search\)/);
assert.match(appSource, /participantIdentity,/);

console.log('participant identity contract verified');
