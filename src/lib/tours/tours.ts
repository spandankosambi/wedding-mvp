/*
 * The page tours: a few short steps per page, shown the first time someone
 * opens it, and again whenever they tap "?". All the wording lives here.
 *
 * A step points at something on the page (a CSS selector) or, with no
 * target, sits in the middle. A step whose target isn't on screen for this
 * person (a helper without that access, an empty list) is skipped, so each
 * role sees only what applies to them. `roles` narrows a step further.
 */

export type TourRole = "couple" | "committee";
export type TourStep = { target?: string; title: string; body: string; roles?: TourRole[] };
export type TourId = "overview" | "family" | "site" | "guests" | "import" | "people" | "print" | "words" | "plan";

const HELP: TourStep = {
  target: "[data-tour-help]",
  title: "Help is always here",
  body: "Tap this ? on any page to see its tour again.",
};

export const TOURS: Record<TourId, TourStep[]> = {
  overview: [
    { title: "Welcome to your wedding workspace", body: "This is where you run the invitations: both families' websites, the guest lists, replies and printed cards. A quick look around takes half a minute." },
    { target: "#numbers", title: "Replies at a glance", body: "How many families are invited, how many have replied, and how many people are coming. These update as guests RSVP." },
    { target: "#families", title: "Each family has its own side", body: "The bride's and the groom's families each get their own website, guest list and cards. Open a side to work on it." },
    { target: "#details", title: "Names, date and city", body: "Set these once. They appear on both websites and on every card.", roles: ["couple"] },
    { target: "#people", title: "Bring in your helpers", body: "Add parents, siblings or cousins and choose what each one can do. They sign in with their own email.", roles: ["couple"] },
    { target: ".portal-nav a[href*='/plan']", title: "Plan", body: "Your to-do list and meeting notes, shared with your helpers." },
    HELP,
  ],
  family: [
    { target: "#share", title: "Your family's link", body: "Share this one link in your WhatsApp groups. Anyone with it can see your website and reply. Each invited family also gets its own private link when you send invites." },
    { target: "#numbers", title: "Your numbers", body: "How many families and guests are on this side's list, and how many have replied." },
    { target: "#rsvp", title: "When replies open and close", body: "Choose who can reply to your side, and the last day for replies." },
    { target: ".portal-nav-pages", title: "Everything for this side", body: "The website, the guest list and the printed cards for this family are all here." },
    HELP,
  ],
  site: [
    { title: "Your family's website", body: "Everything guests see on your wedding site is set here. Changes show on the site as soon as you save." },
    { target: "#theme", title: "Pick a look", body: "Choose a design. You can change it any time; nothing you've typed is lost." },
    { target: "#events", title: "Your functions", body: "Add each function with its date, time and venue. A function marked common shows on both families' sites." },
    { target: "#wording", title: "Invitation wording", body: "The lines on your website and your printed cards. Keep ours, or write them in your own words." },
    { target: "#gallery", title: "Photos", body: "Add a few photos of the two of you. They're shown on the website only." },
    { title: "One Save for the whole page", body: "When you change anything, a Save button appears at the bottom. It saves everything you changed on this page at once." },
  ],
  guests: [
    { target: "#replies", title: "Replies so far", body: "Who has said yes, who can't make it, and who hasn't answered yet." },
    { target: "#list", title: "Three ways to look", body: "Families shows each household. Guests shows every person. Hotels & rooms is for who stays where." },
    { target: "[data-tour='add-family']", title: "Add a family", body: "Add one household at a time: a name, a phone number, and which functions they're invited to." },
    { target: ".portal-shell a[href*='/committee/import']", title: "Already have a list?", body: "Bring in a whole spreadsheet, a photo of a written list, or paste names. You check everything before it's added." },
    { target: "[data-tour='send-invites']", title: "Send invitations", body: "Tick families, then send each one its own private link by WhatsApp or email. Families reply with about one tap per function." },
  ],
  import: [
    { target: "ol[aria-label='Progress']", title: "Three short steps", body: "Bring the list in, check it, then add it to your guest list." },
    { target: "[data-tour='import-ways']", title: "Any list works", body: "A spreadsheet, a photo of a handwritten list, or names typed or pasted in." },
    { title: "Nothing is added until you check it", body: "You'll see every family before anything is saved, and you can fix or remove any of them." },
  ],
  people: [
    { title: "Who can sign in", body: "Everyone listed here can open your workspace with their own email. Guests never need to sign in." },
    { target: "#add", title: "Add someone", body: "Their name, email, and which family's side they help with. They get a sign-in link by email." },
    { target: "#levels", title: "What each person can do", body: "For the website, the guest list and the cards, choose: can't see it, can look, or can change it." },
  ],
  print: [
    { target: "ol[aria-label='Steps']", title: "Two steps to print-ready cards", body: "Set up the size and paper, then choose the design." },
    { target: "[data-testid='pdf-preview']", title: "This is the real card", body: "The preview is exactly what will print. It updates as you change things." },
    { target: "[data-testid='card-language']", title: "Card language", body: "Print in English, Gujarati or Hindi. You can check the translated words before printing." },
    { target: "[data-tour='download']", title: "Download and print", body: "You get two files: the cards, and an envelope to cut and fold. Any printer can print them." },
  ],
  words: [
    { target: "nav[aria-label='Language']", title: "Pick the language", body: "Each language has its own wording for the printed cards." },
    { target: "form[data-save-part='words']", title: "Read it through", body: "Each line has the English beside it. Fix any spelling of names and places, then save." },
    { title: "Only on the cards", body: "These words are used on the printed cards only. Your website stays as it is." },
  ],
  plan: [
    { target: "nav[aria-label='Spaces']", title: "Three spaces", body: "Both families is shared by everyone. Each family's own space is seen only by that family's helpers and the couple." },
    { target: "form[aria-label='Add a task']", title: "Add a task", body: "Type it and press Enter. Tap a task later to give it an owner and a date." },
    { target: "section[aria-labelledby='meetings-h']", title: "Meeting notes", body: "After a family meeting or a vendor visit, note who came and what you decided, so nobody has to remember it." },
    HELP,
  ],
};

/** The steps for this person, in order. */
export function stepsFor(id: TourId, role: TourRole): TourStep[] {
  return TOURS[id].filter((s) => !s.roles || s.roles.includes(role));
}

/** Starts by itself only the first time, only for the couple and committee
    (admin opens weddings to help, so never), and only while tours are on. */
export function autoStartFor(o: { enabled: boolean; role: "couple" | "committee" | "admin"; seen: boolean }): boolean {
  return o.enabled && o.role !== "admin" && !o.seen;
}
