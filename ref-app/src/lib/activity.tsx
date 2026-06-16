import { createContext, useContext, useReducer, type ReactNode } from "react";

export type ActivityEntry = {
  id: string;
  ts: number;
  kind: "deposit" | "withdrawal-request" | "withdrawal-cancel";
  status: "success" | "failed";
  digest?: string;
  events?: string[];
  error?: string;
};

type State = { entries: ActivityEntry[] };
type Action = { type: "push"; entry: Omit<ActivityEntry, "id" | "ts"> } | { type: "clear" };

const MAX = 10;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "push": {
      const entry: ActivityEntry = {
        ...action.entry,
        id: crypto.randomUUID(),
        ts: Date.now(),
      };
      return { entries: [entry, ...state.entries].slice(0, MAX) };
    }
    case "clear":
      return { entries: [] };
  }
}

type Ctx = {
  entries: ActivityEntry[];
  push: (entry: Omit<ActivityEntry, "id" | "ts">) => void;
  clear: () => void;
};

const ActivityContext = createContext<Ctx | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { entries: [] });
  const value: Ctx = {
    entries: state.entries,
    push: (entry) => dispatch({ type: "push", entry }),
    clear: () => dispatch({ type: "clear" }),
  };
  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}

export function useActivity(): Ctx {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error("useActivity must be used inside <ActivityProvider>");
  return ctx;
}
