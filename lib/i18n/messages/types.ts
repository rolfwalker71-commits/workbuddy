import type { de } from "./de";

type AsStrings<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: AsStrings<T[K]> }
    : T;

/** Same keys as German; values are free-form per locale. */
export type MessageTree = AsStrings<typeof de>;

type Join<P extends string, K extends string | number> = P extends ""
  ? `${K}`
  : `${P}.${K}`;

type Leaves<T, P extends string = ""> = T extends string
  ? P
  : T extends Record<string, unknown>
    ? {
        [K in keyof T & (string | number)]: Leaves<T[K], Join<P, K>>;
      }[keyof T & (string | number)]
    : never;

export type MessageKey = Leaves<MessageTree>;

export type TranslateParams = Record<string, string | number | null | undefined>;
