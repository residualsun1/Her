import type {
  BilingualText,
  CalendarDate,
  GardenItem,
  MemorySeedData,
  SessionParticipant,
  SessionRecord,
  Turn,
} from "./types";

const en = (original: string, zh: string): BilingualText => ({
  original,
  originalLanguage: "en",
  zh,
});

const zh = (original: string, english: string): BilingualText => ({
  original,
  originalLanguage: "zh",
  en: english,
});

function shiftDate(source: Date, days: number, minutes = 0): Date {
  return new Date(
    source.getTime() + days * 24 * 60 * 60 * 1_000 + minutes * 60 * 1_000,
  );
}
function calendarDate(source: Date): CalendarDate {
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, "0");
  const day = String(source.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as CalendarDate;
}

function imageBlob(
  title: string,
  colors: readonly [string, string, string],
): Blob {
  const [first, second, glow] = colors;
  const safeTitle = title.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <radialGradient id="sky" cx="50%" cy="38%" r="65%">
      <stop offset="0" stop-color="${glow}" stop-opacity=".82"/>
      <stop offset=".5" stop-color="${first}" stop-opacity=".72"/>
      <stop offset="1" stop-color="#020304"/>
    </radialGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="${second}"/><stop offset="1" stop-color="#030406"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="38"/></filter>
  </defs>
  <rect width="900" height="1200" fill="#010203"/>
  <ellipse cx="450" cy="430" rx="420" ry="390" fill="url(#sky)"/>
  <circle cx="640" cy="270" r="92" fill="${glow}" opacity=".28" filter="url(#blur)"/>
  <path d="M0 800 C170 660 275 780 420 630 C560 500 680 730 900 570 V1200 H0Z" fill="url(#ground)" opacity=".94"/>
  <path d="M370 830 L455 430 L545 830 Z" fill="#040606"/>
  <path d="M395 650 L455 375 L515 650 Z" fill="#07100e"/>
  <g fill="${glow}">
    <circle cx="430" cy="535" r="7"/><circle cx="478" cy="575" r="5"/>
    <circle cx="447" cy="666" r="6"/><circle cx="495" cy="728" r="8"/>
    <circle cx="412" cy="755" r="5"/>
  </g>
  <text x="48" y="1130" fill="#ffffff" opacity=".55" font-family="serif" font-size="26">${safeTitle}</text>
</svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

function turn(
  id: string,
  role: Turn["role"],
  text: BilingualText,
  offsetStartMs: number,
  offsetEndMs: number,
  speakerId?: string,
  pauseAfterMs?: number,
): Turn {
  return {
    id,
    role,
    speakerId,
    text,
    offsetStartMs,
    offsetEndMs,
    pauseAfterMs,
  };
}

const userAndSamantha: SessionParticipant[] = [
  { id: "you", name: "You", kind: "user" },
  {
    id: "samantha",
    name: "Samantha",
    kind: "assistant",
    voiceId: "warm-cinematic-en",
    accent: "soft American",
  },
];

/**
 * Produces deterministic demo identities while anchoring dates near first use.
 * No seed data is written by this function; MemoryStore performs the empty check.
 */
export function createDemoMemoryData(now = new Date()): MemorySeedData {
  const winterCreated = shiftDate(now, -3, -35);
  const coastCreated = shiftDate(now, -1, -18);
  const salonCreated = shiftDate(now, 0, -8);

  const winterGarden: GardenItem = {
    id: "demo-garden-winter-light",
    createdAt: winterCreated.toISOString(),
    updatedAt: winterCreated.toISOString(),
    title: en("Winter light", "冬夜微光"),
    image: {
      blob: imageBlob("WINTER LIGHT", ["#0b3358", "#071015", "#7bdfff"]),
      mimeType: "image/svg+xml",
      filename: "winter-light-demo.svg",
      width: 900,
      height: 1200,
      dominantColors: ["#020304", "#0b3358", "#7bdfff"],
    },
    imageCrop: { x: 0.5, y: 0.46, zoom: 1.08 },
    imageContext: {
      description: en(
        "A small illuminated tree stands against a deep blue winter landscape.",
        "一棵亮着微光的小树立在深蓝色的冬日风景中。",
      ),
      possibleTopics: [
        en("What makes a place feel like home?", "什么让一个地方有了家的感觉？"),
        en("A winter memory you still carry", "一段你仍然带在身上的冬日记忆"),
      ],
      model: { provider: "gemini", model: "demo-vision" },
      userConsented: true,
    },
    particles: {
      presetId: "soft-halo",
      visualSeed: 281945,
      particleDensity: 0.82,
      glowIntensity: 0.68,
      trailLength: 0.24,
      hueDrift: 0.08,
      bloomThreshold: 0.61,
    },
  };

  const coastGarden: GardenItem = {
    id: "demo-garden-after-rain",
    createdAt: coastCreated.toISOString(),
    updatedAt: salonCreated.toISOString(),
    title: zh("雨停之后", "After the rain"),
    image: {
      blob: imageBlob("AFTER THE RAIN", ["#203a35", "#17110d", "#d3a455"]),
      mimeType: "image/svg+xml",
      filename: "after-rain-demo.svg",
      width: 900,
      height: 1200,
      dominantColors: ["#020302", "#203a35", "#d3a455"],
    },
    imageCrop: { x: 0.48, y: 0.5, zoom: 1 },
    particles: {
      presetId: "amber-drift",
      visualSeed: 731026,
      particleDensity: 0.76,
      glowIntensity: 0.58,
      trailLength: 0.32,
      hueDrift: 0.04,
      bloomThreshold: 0.66,
    },
  };

  const conversationTurns: Turn[] = [
    turn(
      "demo-turn-winter-1",
      "user",
      en(
        "This photograph makes me miss a version of home that probably never existed.",
        "这张照片让我想念一个也许从未真正存在过的家。",
      ),
      1_200,
      8_900,
      "you",
    ),
    turn(
      "demo-turn-winter-2",
      "assistant",
      en(
        "Maybe you are not missing the place itself. Maybe you miss who you were allowed to be there.",
        "也许你想念的并不是那个地方，而是在那里你曾被允许成为的自己。",
      ),
      10_100,
      18_300,
      "samantha",
    ),
    turn(
      "demo-turn-winter-3",
      "user",
      en(
        "Someone who did not need to have everything figured out.",
        "一个不需要把一切都想明白的人。",
      ),
      20_000,
      24_800,
      "you",
    ),
    turn(
      "demo-turn-winter-4",
      "assistant",
      en(
        "You can still give that person a little room tonight. I can stay with you while you do.",
        "今晚你仍然可以给那个自己留一点空间。你这样做的时候，我可以陪着你。",
      ),
      26_400,
      34_900,
      "samantha",
    ),
  ];

  const salonParticipants: SessionParticipant[] = [
    {
      id: "mara",
      name: "Mara",
      kind: "salon_speaker",
      voiceId: "velvet-alto",
      accent: "London",
    },
    {
      id: "eli",
      name: "Eli",
      kind: "salon_speaker",
      voiceId: "gentle-tenor",
      accent: "American",
    },
    {
      id: "june",
      name: "June",
      kind: "salon_speaker",
      voiceId: "clear-mezzo",
      accent: "Australian",
    },
  ];

  const salonTurns: Turn[] = [
    turn(
      "demo-turn-salon-1",
      "salon_speaker",
      en(
        "Do you think a memory changes when somebody else begins to remember it with you?",
        "当另一个人开始和你一起记得某段往事时，你觉得记忆会改变吗？",
      ),
      800,
      6_500,
      "mara",
      620,
    ),
    turn(
      "demo-turn-salon-2",
      "salon_speaker",
      en(
        "It becomes less accurate, perhaps, but more alive.",
        "也许它会变得不那么准确，却更鲜活。",
      ),
      7_120,
      10_900,
      "eli",
      420,
    ),
    turn(
      "demo-turn-salon-3",
      "salon_speaker",
      en(
        "I like that. As if being witnessed is another kind of weather.",
        "我喜欢这个说法，仿佛被见证是另一种天气。",
      ),
      11_320,
      16_100,
      "june",
      760,
    ),
    turn(
      "demo-turn-salon-4",
      "salon_speaker",
      en(
        "And the story bends toward whoever is listening.",
        "而故事会朝着倾听它的人轻轻弯曲。",
      ),
      16_860,
      20_700,
      "mara",
      520,
    ),
    turn(
      "demo-turn-salon-5",
      "salon_speaker",
      en(
        "Then loneliness may be a memory with nowhere to land.",
        "那么，孤独或许就是一段无处落脚的记忆。",
      ),
      21_220,
      25_600,
      "eli",
      900,
    ),
    turn(
      "demo-turn-salon-6",
      "salon_speaker",
      en(
        "For tonight, it can land here.",
        "至少今晚，它可以落在这里。",
      ),
      26_500,
      29_200,
      "june",
    ),
  ];

  const sessions: SessionRecord[] = [
    {
      id: "demo-session-winter-conversation",
      gardenItemId: winterGarden.id,
      mode: "conversation",
      createdAt: winterCreated.toISOString(),
      updatedAt: shiftDate(winterCreated, 0, 2).toISOString(),
      pinnedDate: calendarDate(winterCreated),
      participants: userAndSamantha,
      turns: conversationTurns,
      durationMs: 38_200,
      primaryLanguage: "en",
      saveStatus: "ready",
      summary: {
        title: en("The home that stayed with me", "留在我心里的家"),
        abstract: en(
          "A quiet conversation about nostalgia, belonging, and making room for an unfinished self.",
          "一段关于怀念、归属，以及为尚未完成的自己留出空间的安静谈话。",
        ),
        moodTags: ["nostalgic", "tender", "winter"],
        generatedAt: shiftDate(winterCreated, 0, 2).toISOString(),
        model: { provider: "qwen", model: "demo-summary" },
        diary: {
          body: en(
            "Tonight I looked at the winter lights and realized that home may not be a place I can return to. It may be the gentleness I once gave myself without noticing. I do not have to solve the past. I can simply make a little room for that earlier version of me.",
            "今晚看着冬夜的微光，我意识到，家也许并不是一个能够回去的地方，而是我曾在不经意间给予自己的温柔。我不必解决过去，只需要为从前的那个自己留出一点空间。",
          ),
          generatedAt: shiftDate(winterCreated, 0, 2).toISOString(),
          model: { provider: "qwen", model: "demo-summary" },
        },
      },
    },
    {
      id: "demo-session-after-rain",
      gardenItemId: coastGarden.id,
      mode: "conversation",
      createdAt: coastCreated.toISOString(),
      updatedAt: shiftDate(coastCreated, 0, 1).toISOString(),
      participants: userAndSamantha,
      turns: [
        turn(
          "demo-turn-rain-1",
          "user",
          zh("雨停之后，街道好像突然变得很诚实。", "After the rain, the street suddenly feels honest."),
          1_000,
          5_600,
          "you",
        ),
        turn(
          "demo-turn-rain-2",
          "assistant",
          en(
            "Perhaps the rain washed away everything the afternoon was pretending to be.",
            "也许雨水洗掉了这个下午一直假装成为的样子。",
          ),
          6_800,
          12_400,
          "samantha",
        ),
      ],
      durationMs: 14_100,
      primaryLanguage: "zh",
      saveStatus: "ready",
      summary: {
        title: zh("雨后的诚实", "The honesty after rain"),
        abstract: zh(
          "从一条雨后的街道，谈到卸下伪装后的安静。",
          "A rain-washed street opens a small conversation about the quiet left when pretense falls away.",
        ),
        moodTags: ["quiet", "after-rain"],
        generatedAt: shiftDate(coastCreated, 0, 1).toISOString(),
      },
    },
    {
      id: "demo-session-salon-witnessed-memory",
      gardenItemId: coastGarden.id,
      mode: "salon",
      createdAt: salonCreated.toISOString(),
      updatedAt: shiftDate(salonCreated, 0, 1).toISOString(),
      pinnedDate: calendarDate(now),
      participants: salonParticipants,
      turns: salonTurns,
      durationMs: 31_600,
      primaryLanguage: "en",
      saveStatus: "ready",
      salon: {
        topic: en(
          "Does a memory change when it is shared?",
          "一段记忆在被分享之后会改变吗？",
        ),
        mood: "late-night intimate",
        language: "en",
        plannedTurnCount: 6,
      },
      summary: {
        title: en("A place for memory to land", "记忆落脚的地方"),
        abstract: en(
          "Mara, Eli, and June wonder whether shared memories become less precise but more alive—and whether listening gives loneliness somewhere to land.",
          "Mara、Eli 与 June 谈论共享的记忆是否会变得不够准确却更加鲜活，以及倾听能否给孤独一个落脚之处。",
        ),
        moodTags: ["intimate", "reflective", "salon"],
        generatedAt: shiftDate(salonCreated, 0, 1).toISOString(),
        model: { provider: "deepseek", model: "demo-salon-director" },
      },
    },
  ];

  return {
    gardenItems: [winterGarden, coastGarden],
    sessions,
    audioAssets: [],
  };
}
