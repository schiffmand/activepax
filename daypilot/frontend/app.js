// DayPilot frontend -- vanilla JS, no build step. Talks to the FastAPI
// backend at API_BASE. Drives the Now Playing screen off audio.currentTime
// against the schedule.json the backend renders alongside the audio.

const API_BASE = window.DAYPILOT_API_BASE || "";

const state = {
  profile: { user_id: "demo-user-" + Math.random().toString(36).slice(2, 8), chronic_injury_tags: [], today_pain_tags: [] },
  duration_min: 20,
  day_type: "strength",
  equipment: ["bodyweight", "dumbbells"],
  job: null,
  schedule: null,
};

const $ = (id) => document.getElementById(id);
const show = (id) => {
  document.querySelectorAll(".screen").forEach((s) => (s.hidden = true));
  $(id).hidden = false;
};

function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- Intake chat ----------
const CHAT_STEPS = [
  {
    bot: "Hey. What kind of session today — strength, a fast HIIT circuit, or something lighter?",
    chips: [
      { label: "Strength", set: { day_type: "strength" } },
      { label: "HIIT circuit", set: { day_type: "hiit" } },
      { label: "Light / mobility", set: { day_type: "mobility" } },
    ],
  },
  {
    bot: "How long do you have?",
    chips: [
      { label: "15 min", set: { duration_min: 15 } },
      { label: "25 min", set: { duration_min: 25 } },
      { label: "40 min", set: { duration_min: 40 } },
    ],
  },
  {
    bot: "What have you got to train with?",
    chips: [
      { label: "Bodyweight only", set: { equipment: ["bodyweight"] } },
      { label: "Dumbbells", set: { equipment: ["bodyweight", "dumbbells"] } },
      { label: "Full gym", set: { equipment: ["bodyweight", "dumbbells", "barbell", "cable", "bench", "pull_up_bar"] } },
    ],
  },
  {
    bot: "Anything sore or off-limits today? Tell me, or skip if you're clear.",
    chips: [
      { label: "All clear", set: { today_pain_tags: [] } },
      { label: "Shoulder", set: { today_pain_tags: ["shoulder_injury"] } },
      { label: "Knee", set: { today_pain_tags: ["knee_injury"] } },
      { label: "Lower back", set: { today_pain_tags: ["lower_back_injury"] } },
    ],
  },
];

let chatIdx = 0;

function botSay(text) {
  const log = $("chat-log");
  const b = document.createElement("div");
  b.className = "bubble bot";
  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
}
function userSay(text) {
  const log = $("chat-log");
  const b = document.createElement("div");
  b.className = "bubble user";
  b.textContent = text;
  log.appendChild(b);
  log.scrollTop = log.scrollHeight;
}

function renderChatStep() {
  $("chat-chips").innerHTML = "";
  if (chatIdx >= CHAT_STEPS.length) {
    botSay("Got it. Building your session now.");
    setTimeout(startGeneration, 500);
    return;
  }
  const step = CHAT_STEPS[chatIdx];
  botSay(step.bot);
  step.chips.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = c.label;
    btn.onclick = () => {
      userSay(c.label);
      Object.assign(state, c.set);
      chatIdx++;
      setTimeout(renderChatStep, 250);
    };
    $("chat-chips").appendChild(btn);
  });
}

// ---------- Generation ----------
const GEN_STATUS_COPY = {
  queued: "Getting ready…",
  generating_spec: "Choosing today's exercises…",
  rendering_pdf: "Writing your coaching notes…",
  scheduling_audio: "Scripting the cues…",
  rendering_audio: "Mixing music and coaching…",
  exporting: "Finishing the track…",
  ready: "Ready.",
};

async function startGeneration() {
  show("screen-generating");
  try {
    const resp = await fetch(`${API_BASE}/v1/workouts/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: state.profile.user_id,
        duration_min: state.duration_min,
        day_type: state.day_type,
        equipment: state.equipment,
        today_pain_tags: state.profile.today_pain_tags,
      }),
    });
    if (!resp.ok) throw new Error(`generate failed: ${resp.status}`);
    const job = await resp.json();
    state.job = job;
    $("gen-status").textContent = GEN_STATUS_COPY[job.stage] || "Working…";
    if (job.stage === "ready") {
      await loadSchedule();
      renderReview();
      show("screen-review");
    } else {
      $("gen-status").textContent = "Something interrupted the build -- check the backend log.";
    }
  } catch (err) {
    $("gen-status").textContent = "Couldn't reach DayPilot's backend. Is the API running?";
    console.error(err);
  }
}

async function loadSchedule() {
  const resp = await fetch(`${API_BASE}${state.job.schedule_url}`);
  state.schedule = await resp.json();
}

// ---------- Review ----------
function renderReview() {
  const spec = state.job.spec;
  $("review-title").textContent = spec.title;
  const mins = Math.round(state.schedule.total_duration_sec / 60);
  $("review-sub").textContent = `${mins} min · ${state.job.tts_engine} voice · music + bells`;

  const list = $("seg-list");
  list.innerHTML = "";
  state.schedule.segments.forEach((s) => {
    const row = document.createElement("div");
    row.className = `seg-row ${s.kind}`;
    const dur = Math.max(1, Math.round(s.end_sec - s.start_sec));
    row.innerHTML = `<div class="bar" style="flex-basis:4px; min-height:${Math.min(60, 20 + dur / 3)}px"></div>
      <div class="meta"><div class="name">${s.exercise_name || s.kind}</div>
      <div class="dur">${s.kind.replace("_", " ")} · ${dur}s</div></div>`;
    list.appendChild(row);
  });

  if (state.job.warnings && state.job.warnings.length) {
    $("warn-box").hidden = false;
    $("warn-box").textContent = state.job.warnings.join(" ");
  } else {
    $("warn-box").hidden = true;
  }

  $("btn-pdf").onclick = () => window.open(`${API_BASE}${state.job.pdf_url}`, "_blank");
}

// ---------- Now Playing ----------
const audioEl = () => $("audio-el");
let rafId = null;

function startPlayback() {
  const a = audioEl();
  a.src = `${API_BASE}${state.job.audio_url}`;
  show("screen-playing");
  a.play().catch(() => {});
  tick();
}

function currentSegment(t) {
  const segs = state.schedule.segments;
  for (const s of segs) if (t >= s.start_sec && t < s.end_sec) return s;
  return segs[segs.length - 1];
}
function currentCue(t) {
  const cues = state.schedule.cues;
  let best = null;
  for (const c of cues) if (t >= c.start_sec && t <= c.end_sec + 1.0) best = c;
  return best;
}
function nextSegmentAfter(t) {
  const segs = state.schedule.segments;
  for (const s of segs) if (s.start_sec > t && s.kind !== "rest" && s.kind !== "round_rest") return s;
  return null;
}

const RING_CIRC = 2 * Math.PI * 92;

function tick() {
  const a = audioEl();
  const t = a.currentTime;
  const seg = currentSegment(t);
  const isWork = seg && (seg.kind === "work" || seg.kind === "warmup" || seg.kind === "cooldown");
  $("np-state").textContent = seg ? (isWork ? `Work${seg.round_index ? " · Round " + seg.round_index : ""}` : "Rest") : "";
  $("np-exname").textContent = seg ? seg.exercise_name || "" : "";

  const ring = $("np-ring");
  ring.setAttribute("stroke", isWork ? "var(--ember)" : "var(--slate)");
  if (seg) {
    const segDur = Math.max(0.01, seg.end_sec - seg.start_sec);
    const remaining = Math.max(0, seg.end_sec - t);
    const frac = 1 - remaining / segDur;
    ring.setAttribute("stroke-dashoffset", String(RING_CIRC * (1 - frac)));
    $("np-ring-num").textContent = fmtClock(remaining);
  }

  const cue = currentCue(t);
  $("np-cue").textContent = cue ? cue.text : "";

  const nxt = nextSegmentAfter(t);
  $("np-next").textContent = nxt ? nxt.exercise_name || nxt.kind : "Finish";

  if (a.ended || t >= state.schedule.total_duration_sec - 0.3) {
    finishWorkout();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

function finishWorkout() {
  cancelAnimationFrame(rafId);
  const spec = state.job.spec;
  const mainBlocks = spec.blocks.filter((b) => b.round_index !== 0 && b.round_index !== 99);
  const uniq = new Set(mainBlocks.map((b) => b.exercise_id));
  $("done-min").textContent = Math.round(state.schedule.total_duration_sec / 60);
  $("done-ex").textContent = uniq.size;
  show("screen-done");
}

// ---------- Wiring ----------
$("btn-start").onclick = startPlayback;
$("btn-restart").onclick = () => {
  chatIdx = 0;
  $("chat-log").innerHTML = "";
  state.job = null;
  state.schedule = null;
  show("screen-intake");
  renderChatStep();
};
$("np-playpause").onclick = () => {
  const a = audioEl();
  if (a.paused) {
    a.play();
    $("icon-play").hidden = true;
    $("icon-pause").hidden = false;
  } else {
    a.pause();
    $("icon-play").hidden = false;
    $("icon-pause").hidden = true;
  }
};
$("np-back").onclick = () => (audioEl().currentTime = Math.max(0, audioEl().currentTime - 10));
$("np-fwd").onclick = () => {
  const nxt = nextSegmentAfter(audioEl().currentTime);
  if (nxt) audioEl().currentTime = nxt.start_sec;
};

// health indicator
fetch(`${API_BASE}/v1/health`).then((r) => {
  $("api-indicator").style.color = r.ok ? "var(--good)" : "var(--ember)";
}).catch(() => { $("api-indicator").style.color = "var(--ember)"; });

renderChatStep();
