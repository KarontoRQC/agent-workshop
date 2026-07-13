import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync('src/App.tsx', 'utf8');
const consoleSource = fs.readFileSync('src/features/agentConsole/AgentConsole.tsx', 'utf8');
const voiceInteractionSource = fs.readFileSync('src/features/agentConsole/voiceInteractionModel.ts', 'utf8');
const voiceSource = fs.readFileSync('src/hooks/useVoiceControl.ts', 'utf8');
const brandingSource = fs.readFileSync('src/lib/consoleBranding.ts', 'utf8');

assert.match(voiceSource, /FINAL_RESULT_SILENCE_MS = 360/, 'Final speech results must submit quickly.');
assert.match(voiceSource, /INTERIM_RESULT_SILENCE_MS = 850/, 'Interim speech results must keep a stable fallback window.');
assert.match(voiceSource, /RECOGNITION_END_EMIT_MS = 120/, 'Recognition end must flush the command immediately.');
assert.match(
  voiceSource,
  /keepAliveRef\.current = false;\s*setTranscript\(command\);\s*onCommandRef\.current\(command\);/s,
  'A submitted classroom command must close the current recognition session.',
);
assert.doesNotMatch(voiceSource, /COMMAND_SILENCE_MS\s*=\s*2800/, 'The old 2.8 second classroom delay must not return.');
assert.match(
  voiceInteractionSource,
  /if \(listening\) \{\s+return 'listening';[\s\S]*?if \(awake\) \{\s+return 'connecting';[\s\S]*?return 'tap-to-talk';/,
  'Voice UI state must distinguish actual listening from a connecting or tap-to-talk microphone.',
);
assert.match(voiceInteractionSource, /badgeLabel: 'TAP TO TALK'/, 'An inactive one-turn microphone must ask for another click.');
assert.match(voiceInteractionSource, /点击麦克风开始下一轮语音提问/, 'Inactive voice copy must truthfully explain how to continue.');
assert.doesNotMatch(consoleSource, /'STANDBY'|语音待命|待命，等待唤醒/, 'The voice module must not imply that an inactive microphone is listening.');
assert.doesNotMatch(appSource, /语音待命。|Voice standby\./, 'The center caption must not show deceptive voice standby copy.');

assert.match(appSource, /const shouldResumeListening = options\.resumeListening \?\? false;/, 'Listening must stay off by default after TTS.');
assert.doesNotMatch(appSource, /resumeListening:\s*true/, 'No response path may automatically reopen the classroom microphone.');
assert.doesNotMatch(appSource, /系统上线，先生。语音链路已接入|语音链路已关闭，先生/, 'Voice toggle must not block on confirmation speech.');
assert.match(appSource, /void micLevel\.start\(\);\s*voice\.start\(\);/, 'Voice capture must start immediately from the user click.');
assert.match(appSource, /const pauseCurrentResponse = useCallback/, 'App must expose a real response pause action.');
assert.match(appSource, /agentRequestRef\.current\?\.abort\(\);\s*cancelActiveSpeechOutput\(\);/s, 'Pause must abort the request before settling speech.');
assert.match(appSource, /onPause=\{pauseCurrentResponse\}/, 'Agent Console must receive the pause action.');
assert.match(
  appSource,
  /let heroHallSpeechSettled = false;[\s\S]*?const schedulePendingHeroHallJump = \(\) => {[\s\S]*?!recommendationSurfaceUnlockedRef\.current \|\|[\s\S]*?!heroHallSpeechSettled \|\|[\s\S]*?controller\.signal\.aborted/,
  'A reserved Hero Hall page must remain pending until both recommendation cards and the turn speech have settled.',
);
assert.match(
  appSource,
  /await orchestrationPromise\.finally\([\s\S]*?finishReplyWithoutSpeech\(shouldResumeListening\);[\s\S]*?\);\s*heroHallSpeechSettled = true;[\s\S]*?schedulePendingHeroHallJump\(\);/,
  'Hero Hall navigation must be committed only after the complete speech orchestration settles.',
);
assert.match(
  appSource,
  /await playSpeechSegment\('knowledgeExplanation'\);[\s\S]*?await playSpeechSegment\('recommendationAck'\);[\s\S]*?runCardAnimation\(\)/,
  'Speech orchestration must keep the knowledge explanation, recommendation ACK, summary, and card animation ordered.',
);
assert.match(
  appSource,
  /if \(!agentCanSubmitRef\.current\) {[\s\S]*?agentCanSubmitRef\.current = false;/,
  'Message submission must use a synchronous gate instead of a stale React status closure.',
);
assert.match(
  appSource,
  /const pauseCurrentResponse = useCallback\([\s\S]*?agentRequestRef\.current\?\.abort\(\);\s+agentCanSubmitRef\.current = true;/,
  'Pause must immediately unlock the next submission before the aborted turn finishes unwinding.',
);

assert.match(consoleSource, /canPauseResponse/, 'Text composer must receive response activity state.');
assert.match(consoleSource, /<Pause size=\{16\} \/>/, 'Text composer must render the pause icon while active.');
assert.match(consoleSource, /const isPauseAction = canPauseResponse && !hasDraft;/, 'A typed draft must take priority over residual speech pause.');
assert.match(consoleSource, /aria-label=\{isPauseAction \? '暂停当前回答'/, 'Pause button must expose an accessible label.');
assert.match(consoleSource, /data-action=\{isPauseAction \? 'pause' : 'send'\}/, 'Composer action must remain observable in browser tests.');

assert.match(brandingSource, /神兽保佑,代码无bug/, 'Console branding must keep the single approved protection text.');
assert.doesNotMatch(brandingSource, /万水千山总是情|技术总监|JARVIS CONSOLE ONLINE/, 'Removed console copy must not return.');
assert.doesNotMatch(brandingSource, /note\.techstash\.top|https?:\/\//, 'Console branding must not expose the removed blog link.');

console.log('Classroom voice and pause interaction verified.');
