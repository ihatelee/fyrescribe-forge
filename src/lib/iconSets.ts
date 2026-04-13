import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
  // Fantasy (default)
  BookOpenText as FantasyManuscript,
  Hourglass as FantasyTimeline,
  User as FantasyCharacters,
  Mountains as FantasyPlaces,
  CalendarBlank as FantasyEvents,
  BookBookmark as FantasyHistory,
  SketchLogo as FantasyArtifacts,
  Horse as FantasyCreatures,
  MagicWand as FantasyMagic,
  Shield as FantasyFactions,
  Scroll as FantasyDoctrine,
  Tray as FantasyInbox,
  ArrowsClockwise as FantasySync,
  // Sci-fi
  Terminal as SciFiManuscript,
  Timer as SciFiTimeline,
  UserCircleGear as SciFiCharacters,
  Planet as SciFiPlaces,
  CalendarStar as SciFiEvents,
  Database as SciFiHistory,
  Cpu as SciFiArtifacts,
  Alien as SciFiCreatures,
  Atom as SciFiMagic,
  UsersThree as SciFiFactions,
  FileCode as SciFiDoctrine,
  EnvelopeSimple as SciFiInbox,
  ArrowsClockwise as SciFiSync,
  // Standard
  FileText as StdManuscript,
  Clock as StdTimeline,
  Users as StdCharacters,
  MapPin as StdPlaces,
  CalendarBlank as StdEvents,
  BookOpen as StdHistory,
  Diamond as StdArtifacts,
  PawPrint as StdCreatures,
  Sparkle as StdMagic,
  FlagBanner as StdFactions,
  Gavel as StdDoctrine,
  Tray as StdInbox,
  ArrowsClockwise as StdSync,
} from "@phosphor-icons/react";

export type IconSetName = "fantasy" | "scifi" | "standard";

export interface IconSet {
  manuscript: PhosphorIcon;
  timeline: PhosphorIcon;
  characters: PhosphorIcon;
  places: PhosphorIcon;
  events: PhosphorIcon;
  history: PhosphorIcon;
  artifacts: PhosphorIcon;
  creatures: PhosphorIcon;
  magic: PhosphorIcon;
  factions: PhosphorIcon;
  doctrine: PhosphorIcon;
  inbox: PhosphorIcon;
  sync: PhosphorIcon;
}

export const ICON_SETS: Record<IconSetName, IconSet> = {
  fantasy: {
    manuscript: FantasyManuscript,
    timeline: FantasyTimeline,
    characters: FantasyCharacters,
    places: FantasyPlaces,
    events: FantasyEvents,
    history: FantasyHistory,
    artifacts: FantasyArtifacts,
    creatures: FantasyCreatures,
    magic: FantasyMagic,
    factions: FantasyFactions,
    doctrine: FantasyDoctrine,
    inbox: FantasyInbox,
    sync: FantasySync,
  },
  scifi: {
    manuscript: SciFiManuscript,
    timeline: SciFiTimeline,
    characters: SciFiCharacters,
    places: SciFiPlaces,
    events: SciFiEvents,
    history: SciFiHistory,
    artifacts: SciFiArtifacts,
    creatures: SciFiCreatures,
    magic: SciFiMagic,
    factions: SciFiFactions,
    doctrine: SciFiDoctrine,
    inbox: SciFiInbox,
    sync: SciFiSync,
  },
  standard: {
    manuscript: StdManuscript,
    timeline: StdTimeline,
    characters: StdCharacters,
    places: StdPlaces,
    events: StdEvents,
    history: StdHistory,
    artifacts: StdArtifacts,
    creatures: StdCreatures,
    magic: StdMagic,
    factions: StdFactions,
    doctrine: StdDoctrine,
    inbox: StdInbox,
    sync: StdSync,
  },
};

/** The default icon set for each theme */
export const THEME_DEFAULT_ICON_SET: Record<string, IconSetName> = {
  midnight: "fantasy",
  fireside: "fantasy",
  lavender: "fantasy",
  enchanted: "fantasy",
  futureworld: "scifi",
  daylight: "standard",
};

export const ICON_SET_META: { value: IconSetName; label: string; description: string }[] = [
  { value: "fantasy", label: "Fantasy", description: "Swords, scrolls & magic" },
  { value: "scifi", label: "Sci-Fi", description: "Terminals, planets & atoms" },
  { value: "standard", label: "Standard", description: "Clean & minimal" },
];
