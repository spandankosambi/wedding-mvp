/* The Card wording page's fields (browser-safe). */

export type FieldGroup = "front" | "celebrations" | "details" | "headings";
export const GROUP_LABEL: Record<FieldGroup, string> = {
  front: "Front of the card",
  celebrations: "The celebrations",
  details: "Contacts, reply-by and compliments",
  headings: "Headings and envelope",
};

export type CardField = {
  key: string; group: FieldGroup; label: string;
  /** the English on the card */
  en: string;
  /** our first draft in the language */
  auto: string;
  /** a long line: a text box rather than a single line */
  long?: boolean;
  /** English words our draft couldn't put into the language: worth a look */
  check?: boolean;
};

