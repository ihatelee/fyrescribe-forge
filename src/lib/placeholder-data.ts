export const PLACEHOLDER_PROJECTS = [
  {
    id: "p1",
    title: "The Shattered Vigil",
    description: "A grimdark fantasy epic about a kingdom built on forgotten magic",
    last_edited: "2 hours ago",
    word_count: 87420,
  },
  {
    id: "p2",
    title: "Embers of the Old World",
    description: "Post-apocalyptic fantasy where magic returns to a dying earth",
    last_edited: "3 days ago",
    word_count: 34100,
  },
  {
    id: "p3",
    title: "The Pale Court",
    description: "Political intrigue among immortal fae lords",
    last_edited: "1 week ago",
    word_count: 12800,
  },
];

export const PLACEHOLDER_CHAPTERS = [
  {
    id: "ch1",
    title: "The Warden's Watch",
    order: 1,
    scenes: [
      { id: "s1", title: "Cold Dawn", wordCount: 2340, pov: "Kael" },
      { id: "s2", title: "The Signal Fire", wordCount: 1890, pov: "Kael" },
      { id: "s3", title: "Below the Wall", wordCount: 3100, pov: "Sera" },
    ],
  },
  {
    id: "ch2",
    title: "The Merchant's Road",
    order: 2,
    scenes: [
      { id: "s4", title: "Dust and Iron", wordCount: 2780, pov: "Maren" },
      { id: "s5", title: "The Broken Bridge", wordCount: 1650, pov: "Maren" },
    ],
  },
  {
    id: "ch3",
    title: "Blood Tithes",
    order: 3,
    scenes: [
      { id: "s6", title: "The Tax Collector", wordCount: 3200, pov: "Sera" },
      { id: "s7", title: "A Debt Unpaid", wordCount: 2100, pov: "Kael" },
      { id: "s8", title: "Night Court", wordCount: 1980, pov: "Lirae" },
    ],
  },
];

export const PLACEHOLDER_ENTITIES = [
  { id: "e1", name: "Kael Ashford", category: "characters" as const, summary: "A disgraced warden who patrols the northern wall, haunted by the siege he failed to prevent.", tags: ["protagonist", "military"] },
  { id: "e2", name: "Sera Blackthorn", category: "characters" as const, summary: "A spymaster's apprentice with an eidetic memory and a talent for reading people.", tags: ["protagonist", "intelligence"] },
  { id: "e3", name: "Maren of the Dust", category: "characters" as const, summary: "A traveling merchant who smuggles forbidden texts between city-states.", tags: ["protagonist", "merchant"] },
  { id: "e4", name: "Lirae", category: "characters" as const, summary: "An ancient being trapped in the body of a child. Advisor to the Pale Court.", tags: ["antagonist", "fae"] },
  { id: "e5", name: "The Shattered Wall", category: "places" as const, summary: "A massive fortification spanning the northern border, partially destroyed during the Last Siege.", tags: ["fortification", "north"] },
  { id: "e6", name: "Ashenmere", category: "places" as const, summary: "A fog-shrouded port city built on stilts over a poisoned lake.", tags: ["city", "trade"] },
  { id: "e7", name: "The Last Siege", category: "events" as const, summary: "The catastrophic battle that shattered the northern wall fifteen years ago.", tags: ["war", "history"] },
  { id: "e8", name: "The Pale Crown", category: "artifacts" as const, summary: "A crown of white bone that grants its wearer dominion over the dead.", tags: ["cursed", "royalty"] },
  { id: "e9", name: "Duskwraiths", category: "creatures" as const, summary: "Spectral predators that emerge during the twilight hours, drawn to strong emotions.", tags: ["undead", "nocturnal"] },
  { id: "e10", name: "Bloodweaving", category: "abilities" as const, summary: "A forbidden school of magic that uses the caster's vitality as fuel.", tags: ["magic", "forbidden"] },
  { id: "e11", name: "The Vigil", category: "factions" as const, summary: "An order of wardens sworn to defend the wall. Diminished but unbowed.", tags: ["military", "north"] },
  { id: "e12", name: "The Three Truths", category: "doctrine" as const, summary: "The central tenets of the Ashenmere faith: all power is borrowed, all debts are paid, all fires die.", tags: ["religion", "philosophy"] },
];

export const PLACEHOLDER_TIMELINE = [
  { id: "t1", label: "The Founding of the Vigil", dateLabel: "Year 0", type: "world_history" as const, dateSortOrder: 0 },
  { id: "t2", label: "The First Compact", dateLabel: "Year 120", type: "world_history" as const, dateSortOrder: 120 },
  { id: "t3", label: "Construction of the Wall", dateLabel: "Year 245", type: "world_history" as const, dateSortOrder: 245 },
  { id: "t4", label: "The Pale Court rises", dateLabel: "Year 600", type: "world_history" as const, dateSortOrder: 600 },
  { id: "t5", label: "The Last Siege", dateLabel: "15 years ago", type: "world_history" as const, dateSortOrder: 985 },
  { id: "t6", label: "Kael takes the Watch", dateLabel: "10 years ago", type: "story_event" as const, dateSortOrder: 990 },
  { id: "t7", label: "Sera begins her apprenticeship", dateLabel: "8 years ago", type: "story_event" as const, dateSortOrder: 992 },
  { id: "t8", label: "Cold Dawn — Chapter 1 begins", dateLabel: "Present day", type: "story_event" as const, dateSortOrder: 1000 },
];

export const PLACEHOLDER_LORE_SUGGESTIONS = [
  { id: "ls1", type: "new_entity" as const, description: "Detected recurring mention of 'The Iron Compact' — a trade agreement between Ashenmere and the northern holds. Create as a new Doctrine entity?" },
  { id: "ls2", type: "field_update" as const, description: "Kael's backstory references a sister named 'Elara' not yet tracked. Add to Kael's relationships?" },
  { id: "ls3", type: "contradiction" as const, description: "Chapter 1 states the siege was '15 years ago', but Chapter 3 references it as '12 years ago'. Which is correct?" },
  { id: "ls4", type: "new_tag" as const, description: "Multiple entities reference 'bloodweaving' — suggest creating a 'magic_system' tag for cross-referencing." },
];

export const PLACEHOLDER_SCENE_CONTENT = `The wind came down from the north like a blade, carrying with it the smell of old ice and something else—something that made the hairs on Kael's neck stand rigid.

He pressed his back against the frost-rimed stone of the watchtower and watched the tree line. The pines stood black against the grey predawn sky, their branches heavy with snow that hadn't fallen in any natural way. It had simply appeared overnight, as if winter itself had taken a single step closer to the wall.

"Anything?" Bren's voice came from below, rough with cold and too little sleep.

"Nothing yet." Kael kept his eyes on the trees. "But the snow moved again."

A pause. Then the scrape of boots on stone as Bren climbed up to join him. The older warden's face was a map of old scars and older worries, his grey beard crusted with frost.

"Third time this week," Bren said. It wasn't a question.

Kael nodded. Fifteen years he'd walked this stretch of wall—fifteen years since the siege had broken it, and broken everything else besides. In all that time, the snow had never moved like this. Never crept south in the night like a living thing, testing the stones, looking for cracks.

He thought of the reports from the eastern watches. Duskwraiths spotted at midday. Cattle found frozen solid in their pens, not a mark on them. And the dreams—always the dreams. Half the garrison waking in the dark hours, screaming about pale crowns and voices in the ice.

"We should send word to Ashenmere," Kael said.

"We sent word last month. And the month before."

"Then we send it again."

Bren was quiet for a moment. When he spoke, his voice was careful, the way it got when he was about to say something Kael wouldn't like.

"The men are talking about the old compact. The one before the wall."

Kael's jaw tightened. "The compact is dead. The Vigil holds the wall. That's all there is."

"Is it?" Bren looked at him with those weathered eyes. "Because what's out there in those trees, Kael—the wall won't hold it. You know that. I know that. Every man on this watch knows it in his bones."

The wind gusted, and for a moment Kael thought he heard something in it—a voice, or the memory of a voice, speaking words in a language that had been old when the wall was young.

He gripped the hilt of his sword and said nothing.

Below them, the signal fire waited, unlit. It had been fifteen years since anyone had dared to light it. The last time, it had summoned an army.

This time, Kael wasn't sure what it would summon.`;
