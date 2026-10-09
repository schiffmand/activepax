# Competitive landscape and evidence brief

> Compiled Oct 2026 from app-store listings, pricing pages, Trustpilot, Reddit (r/ios, r/ProductivityApps, r/productivity, r/ADHD*), and the research literature. Prices change often, so check them before using any number externally. Where something is unverified it is marked **(verify)**.

## TL;DR

- The category splits into **players** (they *are* the audio: Brain.fm, Endel, Focus@Will, YouTube/Spotify binaural playlists) and **layers** (they play *alongside* your audio: iOS Background Sounds, myNoise, Dark Noise, a few small binaural generators).
- The players are polished but they replace the user's own audio, they're expensive ($60–$100/yr), and they draw billing complaints and boredom ("too repetitive after 10–12 minutes").
- The layers are either **noise-only** (Apple Background Sounds, Dark Noise, myNoise) or **utilitarian binaural tone generators** with dated UI and woo-adjacent copy.
- **Whitespace:** no well-known, beautifully designed, honest, *binaural-plus-noise layer that's built to sit under your own audio* and designed around the needs of ADHD, autistic and deep-work users. Apple's free Background Sounds is the real benchmark for "layer". We have to beat it on binaural beats, intent-based programs, controls, headphone guidance and honesty, without adding friction.

## Landscape table

| Product | Type | Mixes with other audio? | Binaural? | Pricing (approx.) | Praise | Complaints |
|---|---|---|---|---|---|---|
| **Brain.fm** | Player (functional music, amplitude modulation "neural phase locking") | No, it is the music | No (uses modulation, not binaural) | $14.99/mo, $99.99/yr (brain.fm/pricing) | "Indispensable," works for ADHD-ish users, strong science marketing | Price, "tracks too repetitive, annoys me after 10–12 min," billing after trial / renewal anger on Trustpilot, can't keep own music |
| **Endel** | Player (generative adaptive soundscapes, uses time/weather/heart rate) | No (it's the soundscape) **(verify any mix option)** | No (generative) | Subscription, roughly $6–15/mo or ~$60/yr; lifetime offers **(verify)** | Beautiful, calming, adaptive, Apple Watch | "Gimmicky marketing," expensive, Trustpilot 2.1/5 mostly billing |
| **Focus@Will** | Player (curated focus music) | No | No | Subscription **(verify current status/pricing)** | Early pioneer | Dated, repetitive, "personality-type" claims |
| **myNoise** | Noise/soundscape generator, very deep | **Yes**, an option to play with other apps (per r/ios) | Has some binaural/"brainwave" generators | Free + IAP for generator packs | Superb sound quality and depth, loved by audio nerds | Dense, dated UI. Overwhelming for ADHD and sensory-sensitive users |
| **Dark Noise** (Charlie Chapman) | Ambient noise mixer | **Yes**, plays with other media (per r/ios) | No | Historically a ~$6 one-time purchase, now free + IAP | Beautiful iOS-native design, widgets, Shortcuts, custom mixes | No binaural, iOS-only |
| **iOS Background Sounds** (Settings → Accessibility → Audio & Visual) | Built-in noise layer | **Yes**, "Use When Media Is Playing" with a separate volume | No | Free | Zero install, Control Center toggle, separate volume under media | Buried in Accessibility, 6 sounds, no binaural, no programs/timers worth the name, no Android |
| **Binaural Beats: Sleep Focus** (App Store id1327464565) | Binaural generator | **Yes**: "Now mixable with music apps like Spotify" | Yes | Freemium + subscription | Mixability | Generic UI, overclaiming copy typical of the category |
| **Binaurality** (App Store id6746432283) | Custom binaural + "blend with your music" | **Yes**, explicitly positioned to blend with music | Yes | **(verify)** | Closest direct concept competitor. Precision/customization focus | New, small. **Watch closely** |
| **Atmosphere / BetterSleep / Calm / Headspace (focus music)** | Players/mixers inside wellness suites | Mostly no, or partial | Some include "binaural" tracks | $50–70/yr | Brand trust, content breadth | Bloat. Focus is a side feature |
| **Spotify/YouTube "binaural beats" playlists** | Free content | No: you pick *either* your music or the beats | Yes (quality varies; compression and stereo handling unreliable) | Free / ads | Free, huge variety | Ads interrupt, can't layer under a podcast, pollutes recommendations (Spotify Community thread), often mono-folded or over-compressed |
| **Noisli / Chroma Doze (Android, open-source)** | Noise mixers | Chroma Doze: yes (no focus request) **(verify)**; Noisli web: separate tab | No | Free / Noisli subscription | Simple | Noise only |
| **I-Doser ("digital drugs")** | Binaural "doses" | — | Yes | IAP | — | **Reputational contamination**: the reason "binaural beats" reads as woo to many people. Never look or sound like this |

## What reviews tell us, in themes

1. **Price and billing trust is the #1 complaint.** Brain.fm and Endel Trustpilot pages are dominated by "charged after I cancelled," "charged 12 months upfront." *An honest, reminder-before-billing, easy-cancel policy is a brand weapon.*
2. **Habituation and boredom.** "Works great until it doesn't." Same tracks get annoying. *Variation (drift) and the ability to bring your own audio both solve this.* Your own music never gets old because you choose it.
3. **"I want my podcast AND the focus sound."** Recurring in r/ios ("any way to listen to music and podcasts at the same time?") and in the Facebook/Quora "binaural under my music" questions. Users currently get by with Apple Background Sounds plus Spotify, or YouTube in two tabs.
4. **Gimmicky marketing loses smart users.** Reddit on Endel: "the way it's marketed seems highly gimmicky." HN and skeptic crowds dismiss the category as woo.
5. **Design gap.** The noise apps people love (Dark Noise) are beautifully native, while most binaural apps look like 2014 shareware. Nobody combines *Dark Noise craft* with *binaural plus intent programs*.

## The whitespace: "a layer under your own audio"

**Positioning sentence (draft):** *A quiet layer of binaural tones and soft noise that sits under whatever you're already listening to, for focus, calm and sleep. Honest about the science. Gentle on your senses.*

Why this can win:
- **It works with users' existing audio instead of competing with it.** We don't have to license music or beat Spotify. We make Spotify, podcasts and YouTube better for focus.
- **Very low switching cost.** Keep everything you already use and add one tap.
- **Defensible craft areas:** (a) audio-session engineering so it reliably mixes and never ducks, (b) headphone and stereo guidance, (c) intent programs with gentle drift, (d) neurodivergent-first sensory design, (e) honest evidence plus n-of-1 self-experiments.
- **Apple Background Sounds is the true incumbent.** It proves the behaviour but is hidden, limited and noise-only. We should be "Background Sounds, done properly, plus binaural, for every phone."

Technical caveats that shape product (see `native/` for the engines):
- **iOS:** `AVAudioSession` category `.playback` with option `.mixWithOthers` lets us play under Spotify. **But** an app that mixes with others generally **can't own the Now Playing / lock-screen media controls**. (Expo's docs say this explicitly: lock-screen controls require `doNotMix`.) So remote control has to come from a **Live Activity, widgets, Control Center controls (iOS 18+), App Intents/Shortcuts, and the Watch app**. Good news: that's also the "control away from the app" principle.
- **Android:** play without requesting audio focus, inside a `mediaPlayback` foreground service with a persistent notification that carries our controls. OEM battery killers (Samsung, Xiaomi) are a known risk. Guide users through it.
- **Binaural requires true stereo to each ear.** Mono Audio (an accessibility setting), a single AirPod, the phone speaker, Bluetooth hands-free/call mode (which folds to mono), and **Spatialize Stereo / head tracking** (sound designers report it mangles binaural recordings) all break or degrade the effect. Product response: a headphone check, a gentle in-app warning, and an automatic suggestion of **noise-only mode**, which still delivers masking value.
- **Ducking:** other apps (navigation, podcasts with ducking) may duck *us*. That's fine. We must never duck *them*.

## The evidence, honestly

**Mechanism.** Play tone A in the left ear and tone B in the right (e.g. 200 Hz / 210 Hz). The brainstem (superior olivary complex) produces a perceived 10 Hz "beat". The *entrainment hypothesis* holds that cortical oscillations sync to that beat frequency. Beats are most perceptible with carriers below ~1000 Hz (typically 100–500 Hz) and beat frequencies below ~30–40 Hz.

**What studies show**
- **Garcia-Argibay, Santed & Reales (2019) meta-analysis** (22 studies, *Psychological Research*): small-to-moderate effects on **anxiety, memory, attention and perceived pain**. Effects were larger when exposure came *before or during* a task, when beats were not masked by music (pink or white noise masking made no difference), and with longer exposure (no habituation found). → *Supports our "under noise" default. Notably, music masking may reduce effect, so be honest that layering under busy music is the convenience trade-off.*
- **Ingendoh et al. (2023) systematic review, PLOS ONE** (EEG entrainment): results were **inconsistent**. Roughly as many studies contradicted entrainment as supported it, and methods varied widely. → *Entrainment as a mechanism is not established.*
- **Klichowski and colleagues**: in a large-sample study, binaural beats **worsened** cognitive performance relative to baseline, whether or not participants were told they'd help. → *Possible harm for some tasks, so the product must offer noise-only and self-experiment modes.*
- **Clinical anxiety (2023 RCTs, peri-operative)**: beats reduced anxiety vs. no headphones, but **were not superior to patient-chosen music** (Prasad 2023). → *Calm effects may be about sound and agency in general. That's an argument for layering under music the user picked.*
- **Young adults systematic review (Elnazer, Acta Neuropsychiatrica, 2026)**: SMDs of 0.3–0.6 across anxiety, sleep and cognition, with high heterogeneity and small samples.
- **Noise and ADHD (Nigg et al. 2024 meta-analysis, JAACAP)**: white or pink noise gives a **small benefit (g≈0.25)** on lab tasks for people with ADHD or high inattention, and **neutral or slightly negative for typical attenders**. Consistent with optimal-arousal and moderate-brain-arousal theory. → *The strongest evidence we have is for **noise**, and specifically for the ADHD population. Our noise layer is not decoration. It may be the most evidence-backed part of the product.*

**Frequencies people commonly use** (conventions, not proven prescriptions):

| Band | Beat range | Common folk use |
|---|---|---|
| Delta | 0.5–4 Hz | Sleep |
| Theta | 4–8 Hz | Meditation, drowsy relaxation, NSDR |
| Alpha | 8–12 Hz | Calm alertness, unwinding |
| Beta (low) | 12–20 Hz | Focus, active work |
| Gamma | ~40 Hz | "Focus/cognition" (heavily hyped, mixed evidence) |

Recommended defaults: carriers 150–400 Hz (lower is warmer and less fatiguing), with a soft noise bed (brown or pink) at a lower level, and gentle fade-ins and fade-outs.

## Claims we must avoid (FTC / App Store / Google Play)

**Regulatory anchors**
- **FTC Act §5 and health-claims guidance**: health and performance claims need "competent and reliable scientific evidence." **Lumosity (2016) paid $2M** (with a $50M suspended judgment) for claiming its games improve work and school performance and help with ADHD, dementia and similar conditions. That's a direct precedent for any "focus/ADHD" claim.
- **Apple App Store Review Guideline 1.4.1** (physical harm / medical): apps that claim medical functionality without regulatory clearance or evidence are rejected. **Google Play's Health apps policy** is similar. Note also FDA's software-as-a-medical-device boundary: "treats ADHD" or "treats insomnia" moves us into medical-device territory.

**Never say:** treats / cures / heals / therapy for ADHD, autism, anxiety, depression, insomnia; "clinically proven"; "boost IQ"; "replaces medication"; "digital drugs"; "rewires your brain"; "DNA repair"; "solfeggio healing"; "scientifically guaranteed"; specific % improvements; fake or incentivized testimonials (the FTC also hit Lumosity on these).

**Safe framing:** "Designed for focus, calm and sleep sessions." "Many people find a steady background sound helps them settle into work." "The research on binaural beats is mixed; here's what's known." "Not a medical device. Not a treatment for any condition." Persona-inclusive marketing ("made with ADHD and autistic people in mind") is fine as long as it's about *design*, not *outcomes*.

**Safety notes to include:** consult a doctor if you have epilepsy or a seizure disorder (standard caution in the category). Don't use while driving or operating machinery in sleep/delta modes. Keep the volume moderate (hearing health; consider WHO safe-listening guidance and iOS headphone-level features).

## Sources
- Brain.fm pricing: https://www.brain.fm/pricing · Trustpilot: https://www.trustpilot.com/review/brain.fm · Reddit review: https://www.reddit.com/r/ProductivityApps/comments/1kdut61/brainfm_review_after_using_it_for_a_week/
- Endel: https://endel.io/ · App Store: https://apps.apple.com/us/app/endel-focus-sleep-sounds/id1346247457 · Trustpilot: https://www.trustpilot.com/review/endel.io · Reddit: https://www.reddit.com/r/productivity/comments/nonndv/
- r/ios on mixing (myNoise, Dark Noise): https://www.reddit.com/r/ios/comments/o3h78i/any_way_to_listen_to_music_and_podcasts_at_the/
- Dark Noise: https://apps.apple.com/us/app/-/id1465439395 · https://512pixels.net/2020/07/dark-noise-2/ · https://toolsandtoys.net/dark-noise-2-0
- Binaurality: https://apps.apple.com/us/app/binaurality/id6746432283 · Binaural Beats: Sleep Focus: https://apps.apple.com/us/app/binaural-beats-sleep-focus/id1327464565
- Apple Background Sounds: https://www.imore.com/how-use-background-sounds-iphone-and-ipad · https://9to5mac.com/2021/05/19/apple-announces-ios-iphone-background-sounds/
- Spotify community (binaural polluting recs): https://community.spotify.com/t5/Other-Podcasts-Partners-etc/Podcasts-binaural-beats-etc-showing-up-on-Release-radar-and/td-p/6517127
- Spatial audio vs binaural: https://www.vrtonung.de/en/?p=8237 · Bluetooth mic/mono: https://www.garethfry.co.uk/isschapter9
- Expo audio (mixWithOthers vs lock screen): https://docs.expo.dev/versions/latest/sdk/audio/
- Garcia-Argibay 2019 meta-analysis: https://pubmed.ncbi.nlm.nih.gov/30073406/
- Ingendoh et al. 2023 systematic review: https://pmc.ncbi.nlm.nih.gov/articles/PMC10198548/
- Binaural beats and psychiatric disorders review: https://openpublichealthjournal.com/VOLUME/17/ELOCATOR/e18749445332258/FULLTEXT/
- Anxiety/depression systematic review (MDPI 2024): https://www.mdpi.com/2076-3417/14/13/5675
- Young adults systematic review (Cambridge): https://www.cambridge.org/core/journals/acta-neuropsychiatrica/article/music-and-binaural-beat-interventions-for-young-adults-a-systematic-review-of-effects-on-anxiety-sleep-and-cognition/4282E1152FD3EACA5DF8304935165202
- Klichowski coverage: https://www.sciencealert.com/binaural-beats-could-actually-hinder-learning-study-warns
- Nigg et al. 2024 noise and ADHD meta-analysis: https://pmc.ncbi.nlm.nih.gov/articles/PMC11283987/ · MBA model challenge: https://www.sciencedirect.com/science/article/abs/pii/S0028393224001763
- FTC Lumosity: https://www.ftc.gov/news-events/news/press-releases/2016/01/lumosity-pay-2-million-settle-ftc-deceptive-advertising-charges-its-brain-training-program
