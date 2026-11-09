import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoreInboxPage from "./LoreInboxPage";

// Minimal chainable mock of the Supabase query builder, keyed by table name.
// Each `.from(table)` call gets a fresh builder whose resolved value depends
// on whether `.select()`, `.update()`, or `.insert()` was called on it —
// mirroring the handful of operations LoreInboxPage actually performs.
const { tableResults, writeCalls, makeBuilder } = vi.hoisted(() => {
  const writeCalls: { table: string; op: "update" | "insert"; payload: unknown }[] = [];
  const tableResults: Record<string, { select?: unknown; update?: unknown; insert?: unknown }> = {};

  function makeBuilder(table: string) {
    let mode: "select" | "update" | "insert" = "select";
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => {
      mode = "select";
      return builder;
    });
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.update = vi.fn((payload: unknown) => {
      mode = "update";
      writeCalls.push({ table, op: "update", payload });
      return builder;
    });
    builder.insert = vi.fn((payload: unknown) => {
      mode = "insert";
      writeCalls.push({ table, op: "insert", payload });
      return builder;
    });
    builder.single = vi.fn(() =>
      Promise.resolve(tableResults[table]?.insert ?? { data: null, error: null }),
    );
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const value =
        mode === "update"
          ? tableResults[table]?.update ?? { error: null }
          : mode === "insert"
            ? tableResults[table]?.insert ?? { data: null, error: null }
            : tableResults[table]?.select ?? { data: [], error: null };
      return Promise.resolve(value).then(resolve, reject);
    };
    return builder;
  }

  return { tableResults, writeCalls, makeBuilder };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => makeBuilder(table)),
    functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
  },
}));

const ACTIVE_PROJECT = { id: "proj-1", title: "Test Project" };

vi.mock("@/contexts/ProjectContext", () => ({
  useActiveProject: () => ({ activeProject: ACTIVE_PROJECT }),
}));

vi.mock("@/components/AppLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const EXISTING_ENTITY = {
  id: "entity-1",
  name: "Evette",
  summary: "An existing summary.",
  sections: { Overview: "Already has an overview." },
  aliases: [] as string[],
  fields: { "Place of Birth": "Rivenwood" },
};

const UPDATE_SUGGESTION = {
  id: "sugg-1",
  type: "update",
  status: "pending",
  payload: {
    name: "Evette",
    category: "characters",
    description: "",
    confidence: 0.9,
    at_a_glance: { "Eye Color": "Green" },
    sections: {},
  },
  created_at: new Date().toISOString(),
  entity_id: null,
  project_id: "proj-1",
  reviewed_at: null,
};

function setupMocks() {
  writeCalls.length = 0;
  tableResults.lore_suggestions = {
    select: { data: [UPDATE_SUGGESTION], error: null },
    update: { error: null },
  };
  tableResults.entities = {
    select: { data: [EXISTING_ENTITY], error: null },
    update: { error: null },
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LoreInboxPage />
    </MemoryRouter>,
  );
}

function getEntitiesUpdatePayload() {
  const call = writeCalls.find((c) => c.table === "entities" && c.op === "update");
  return call?.payload as { fields?: Record<string, string> } | undefined;
}

describe("LoreInboxPage — accepting an update suggestion with at-a-glance fields", () => {
  beforeEach(() => {
    setupMocks();
  });

  it("merges new at-a-glance fields into entities.fields without wiping existing ones (accept)", async () => {
    renderPage();
    const acceptButton = await screen.findByTitle("Accept — create entity");
    fireEvent.click(acceptButton);

    await waitFor(() => expect(getEntitiesUpdatePayload()).toBeDefined());
    const payload = getEntitiesUpdatePayload();
    expect(payload?.fields).toEqual({
      "Place of Birth": "Rivenwood",
      "Eye Color": "Green",
    });
  });

  it("merges new at-a-glance fields into entities.fields without wiping existing ones (edit-then-accept)", async () => {
    renderPage();
    const editButton = await screen.findByTitle("Edit before accepting");
    fireEvent.click(editButton);
    const saveButton = await screen.findByTitle("Save & Accept");
    fireEvent.click(saveButton);

    await waitFor(() => expect(getEntitiesUpdatePayload()).toBeDefined());
    const payload = getEntitiesUpdatePayload();
    expect(payload?.fields).toEqual({
      "Place of Birth": "Rivenwood",
      "Eye Color": "Green",
    });
  });
});
