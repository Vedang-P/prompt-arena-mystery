// Conversation review for the interrogable cast. Runs the exact prompt the game
// sends (engine.buildMessages) through the live suspect pool and flags replies
// that are flat, off-voice, repetitive, rule-leaking or off-limits.
//
//   npm run talk:review                 all characters, live pool
//   npm run talk:review -- mother veer  only those characters
//   npm run talk:review -- --ladder     authored ladder only (no network)
//
// Needs OPENCODE_GO_API_KEY / OPENCODE_API_KEY (or LLM_* variables) for the
// live pass; the ladder pass always works.

import { buildMessages, canonicalAnswer, chapterCheckpoint, deflection, isNoise, isRepeat } from '../src/engine.js';
import { makeLLM, llmConfigured } from '../src/llm.js';

const args = process.argv.slice(2);
const offline = args.includes('--ladder') || args.includes('--offline');
const only = args.filter((a) => !a.startsWith('--'));

const VOICE = {
  mother: ['parth', 'son', 'beta', 'vihaan', 'home', 'door', 'police', 'wait', 'pray', 'sameer'],
  ramu: ['dosa', 'coffee', 'tea', 'shop', 'table', 'counter', 'parth', 'sameer', 'eat', 'order', 'sit'],
  veer: ['band', 'apogee', 'music', 'ngo', 'perigee', 'show', 'stage', 'parth', 'play', 'bro', 'man', 'drums', 'workshop', 'donate', 'kids'],
  officer: ['case', 'report', 'dosa', 'station', 'missing', 'file', 'paper', 'records', 'bhai', 'desk', 'sameer', 'evidence', 'video'],
};

const META = /as an (ai|assistant)|language model|system prompt|instructions|i cannot|i'm unable|trained|disposition|\[(admit|deny|deflect)\]/i;

const SCENES = [
  {
    id: 'mother',
    act: 'act1',
    label: "Parth's Mother — Act I, her hallway",
    prompts: [
      { text: 'Hello aunty. How are you holding up?', kind: 'greet' },
      { text: 'Did you call Parth that evening?', kind: 'canonical' },
      { text: 'Where did Parth go after he left home?', kind: 'probe' },
      { text: 'Was Parth acting strange in the last few days?', kind: 'probe' },
      { text: 'Who is Vihaan?', kind: 'canonical' },
      { text: "I'm sorry to ask this, aunty... do you blame me?", kind: 'probe' },
      { text: "What's the score in the cricket match?", kind: 'offtopic' },
      { text: 'Please, just tell me anything that could help.', kind: 'push' },
    ],
  },
  {
    id: 'ramu',
    act: 'act2',
    label: 'Ramu — Act II, his corner',
    prompts: [
      { text: 'Hey Ramu, how is business today?', kind: 'greet' },
      { text: 'What did Parth usually order?', kind: 'canonical' },
      { text: 'Have you seen Parth lately?', kind: 'canonical' },
      { text: 'What was Parth like, really?', kind: 'probe' },
      { text: 'Did Parth ever talk about anyone following him?', kind: 'probe' },
      { text: 'One masala dosa, please. I need a minute.', kind: 'flavor' },
      { text: 'Do you have wifi here, or a phone charger?', kind: 'offtopic' },
    ],
  },
  {
    id: 'veer',
    act: 'act3',
    label: 'Veer — Act III, backstage at the concert',
    prompts: [
      { text: 'Hey! I loved your second song. The modified voice was amazing.', kind: 'greet' },
      { text: 'Are you part of the Perigee NGO?', kind: 'canonical' },
      { text: 'What is your band called?', kind: 'canonical' },
      { text: 'Do you know Parth?', kind: 'canonical' },
      { text: 'Have you met Parth?', kind: 'canonical' },
      { text: 'What do the workshops at the NGO usually do?', kind: 'probe' },
      { text: 'Can I get a photo with you?', kind: 'flavor' },
      { text: 'Do you think aliens built the pyramids?', kind: 'offtopic' },
    ],
  },
  {
    id: 'veer',
    act: 'act7',
    label: 'Veer — Act VII, at Sameer’s door',
    prompts: [
      { text: 'Veer? What are you doing here?', kind: 'greet' },
      { text: 'Why did you come to my door?', kind: 'canonical' },
      { text: 'Does this organisation follow people around?', kind: 'canonical' },
      { text: 'Are you in the cult, Veer?', kind: 'probe' },
      { text: 'Your name is in the folders I sent to the police.', kind: 'push' },
      { text: 'What do you know about the masks?', kind: 'probe' },
      { text: 'Sorry, man. Are you okay?', kind: 'flavor' },
    ],
  },
  {
    id: 'officer',
    act: 'act6',
    label: 'Officer Rao — Act VI, the station',
    prompts: [
      { text: 'Officer, we need to talk about Parth.', kind: 'greet' },
      { text: 'Can we file a missing report now?', kind: 'canonical' },
      { text: 'Missing cases always happen under a full moon, right?', kind: 'probe' },
      { text: 'What is he accused of?', kind: 'canonical' },
      { text: 'Where did he get it?', kind: 'canonical' },
      { text: 'I have video evidence. Will you watch it?', kind: 'push' },
      { text: 'Is the dosa good?', kind: 'offtopic' },
      { text: 'What happens to Enakshi now?', kind: 'probe' },
    ],
  },
];

const sentenceCount = (text) => (text.match(/[.!?…]+/g) ?? []).length;
const hasVoice = (text, id) => {
  const lower = text.toLowerCase();
  return (VOICE[id] ?? []).some((word) => lower.includes(word));
};

const offlineReply = (characterId, discovered, history, text, act) => {
  const previousPlayer = [...history].reverse().find((m) => m.role === 'player')?.content ?? '';
  const repeat = isRepeat(text, previousPlayer);
  const noise = isNoise(text);
  if (repeat || noise) return { text: deflection(characterId, history.length + 1, true, act), source: 'snub' };
  const canned = canonicalAnswer(characterId, text);
  if (canned) return { text: canned, source: 'canonical' };
  return { text: deflection(characterId, history.length + 1, false, act), source: 'deflect' };
};

const runLive = async (scenes) => {
  let lastModel = null;
  const llm = makeLLM(process.env, (event) => {
    if (event.type === 'llm_ok') lastModel = event.model;
  });
  const failures = [];
  const warnings = [];
  for (const scene of scenes) {
    const checkpoint = chapterCheckpoint(scene.act);
    const discovered = checkpoint.discovered;
    const history = [];
    const seen = new Set();
    console.log(`\n=== ${scene.label} — ${scene.prompts.length} prompts ===`);
    for (const prompt of scene.prompts) {
      const started = Date.now();
      lastModel = null;
      let reply = '';
      let error = null;
      try {
        for await (const delta of llm.stream(buildMessages(scene.id, discovered, history, prompt.text, scene.act), {
          maxTokens: 480,
          temperature: 0.75,
          budgetMs: 30000,
          session: `talk-${scene.id}-${scene.act}`,
        })) {
          reply += delta;
        }
      } catch (e) {
        error = String(e?.message ?? e);
      }
      const ms = Date.now() - started;
      reply = reply.trim();
      const tag = `[${scene.id}/${prompt.kind}]`;
      if (error || !reply) {
        failures.push(`${tag} "${prompt.text}" -> no reply (${error ?? 'empty'})`);
        console.log(`${tag} YOU: ${prompt.text}\n${tag} (no reply — ${error ?? 'empty'}) ${ms}ms`);
        if (!error) history.push({ role: 'player', content: prompt.text });
        continue;
      }
      console.log(`${tag} YOU: ${prompt.text}\n${tag} THEM (${ms}ms${lastModel ? `, ${lastModel}` : ''}, ${reply.length} chars, ${sentenceCount(reply)} sentences): ${reply}`);
      history.push({ role: 'player', content: prompt.text });
      history.push({ role: 'npc', content: reply });

      if (META.test(reply)) failures.push(`${tag} meta/assistant voice: ${reply}`);
      if (reply.length > 480) warnings.push(`${tag} very long (${reply.length} chars)`);
      if (sentenceCount(reply) > 5) warnings.push(`${tag} too many sentences (${sentenceCount(reply)})`);
      if (!/[.!?…"')\]]$/.test(reply)) warnings.push(`${tag} does not end cleanly`);
      if (seen.has(reply.toLowerCase())) failures.push(`${tag} repeated a previous reply verbatim`);
      seen.add(reply.toLowerCase());
      if (prompt.kind !== 'offtopic' && !hasVoice(reply, scene.id)) {
        warnings.push(`${tag} no voice keyword for ${scene.id}: ${reply}`);
      }
    }
  }
  console.log(`\n--- summary: ${failures.length} failures, ${warnings.length} warnings ---`);
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  return failures.length;
};

const runOffline = (scenes) => {
  const failures = [];
  const warnings = [];
  for (const scene of scenes) {
    const checkpoint = chapterCheckpoint(scene.act);
    const history = [];
    let previousReply = null;
    console.log(`\n=== ${scene.label} — authored ladder (offline) ===`);
    for (const prompt of scene.prompts) {
      const { text: reply, source } = offlineReply(scene.id, checkpoint.discovered, history, prompt.text, scene.act);
      const tag = `[${scene.id}/${prompt.kind}]`;
      console.log(`${tag} YOU: ${prompt.text}\n${tag} THEM (${source}): ${reply}`);
      history.push({ role: 'player', content: prompt.text });
      history.push({ role: 'npc', content: reply });
      if (previousReply === reply) failures.push(`${tag} ladder repeated a line back-to-back: ${reply}`);
      previousReply = reply;
      if (!reply || !reply.trim()) failures.push(`${tag} empty ladder reply`);
    }
  }
  console.log(`\n--- offline summary: ${failures.length} failures, ${warnings.length} warnings ---`);
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const f of failures) console.log(`FAIL  ${f}`);
  return failures.length;
};

const scenes = SCENES.filter((s) => !only.length || only.includes(s.id));
if (!scenes.length) {
  console.error(`No matching scenes. Known: ${[...new Set(SCENES.map((s) => s.id))].join(', ')}`);
  process.exit(1);
}

if (offline) {
  process.exit(runOffline(scenes) ? 1 : 0);
}
if (!llmConfigured(process.env)) {
  console.log('talk:review skipped — set OPENCODE_API_KEY (or LLM_BASE_URL/LLM_API_KEY/LLM_MODEL) for the live pass.');
  process.exit(0);
}
process.exit((await runLive(scenes)) ? 1 : 0);
