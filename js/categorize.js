// ---------- Tandem · auto-categorization ----------

export const CATEGORIES = [
  { id: "income",    label: "Income",         icon: "💵", color: "#34d399" },
  { id: "housing",   label: "Housing",        icon: "🏠", color: "#a78bfa" },
  { id: "utilities", label: "Utilities",      icon: "💡", color: "#fbbf24" },
  { id: "groceries", label: "Groceries",      icon: "🛒", color: "#4ade80" },
  { id: "dining",    label: "Dining out",     icon: "🍜", color: "#fb923c" },
  { id: "transport", label: "Transport",      icon: "🚗", color: "#38bdf8" },
  { id: "health",    label: "Health",         icon: "🩺", color: "#f472b6" },
  { id: "insurance", label: "Insurance",      icon: "🛡️", color: "#94a3b8" },
  { id: "subs",      label: "Subscriptions",  icon: "🔁", color: "#22d3ee" },
  { id: "shopping",  label: "Shopping",       icon: "🛍️", color: "#e879f9" },
  { id: "fun",       label: "Fun & travel",   icon: "🎉", color: "#facc15" },
  { id: "kids",      label: "Kids & pets",    icon: "🧸", color: "#fda4af" },
  { id: "savings",   label: "Savings & invest", icon: "🌱", color: "#2dd4bf" },
  { id: "debt",      label: "Debt payments",  icon: "💳", color: "#f87171" },
  { id: "other",     label: "Other",          icon: "📦", color: "#9ca3af" },
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catLabel = (id) => (CAT[id] || CAT.other).label;
export const catIcon = (id) => (CAT[id] || CAT.other).icon;
export const catColor = (id) => (CAT[id] || CAT.other).color;

// keyword → category. First match wins; longest keywords first where ambiguous.
const RULES = [
  ["payroll|direct dep|salary|paycheck|employer|stripe payout|client payment|invoice|freelance|venmo from|interest paid|dividend", "income"],
  ["mortgage|rent |rent$|landlord|hoa|property tax|home depot|lowes|plumb|roof", "housing"],
  ["electric|power|water bill|sewer|gas bill|utility|internet|comcast|xfinity|verizon fios|att u-verse|t-mobile|trash|waste", "utilities"],
  ["whole foods|trader joe|kroger|safeway|costco|aldi|wegmans|publix|heb |grocery|market basket|food lion|sprouts", "groceries"],
  ["restaurant|cafe|coffee|starbucks|chipotle|mcdonald|doordash|ubereats|uber eats|grubhub|pizza|sushi|taco|brewery|bar |bistro|diner|thai|deli", "dining"],
  ["shell|chevron|exxon|gas station|fuel|uber|lyft|parking|toll|metro|transit|amtrak|car wash|autozone|jiffy lube|mechanic|car repair|tire", "transport"],
  ["pharmacy|cvs|walgreens|doctor|dental|dentist|clinic|hospital|copay|therapy|optom|vision|urgent care", "health"],
  ["geico|state farm|progressive|allstate|insurance|premium", "insurance"],
  ["netflix|spotify|hulu|disney|hbo|max.com|apple.com/bill|icloud|youtube premium|prime member|audible|gym|peloton|patreon|substack|nytimes|adobe|dropbox|1password|chatgpt|claude.ai|playstation plus|xbox game pass|crunchyroll|paramount", "subs"],
  ["amazon|target|walmart|best buy|ikea|etsy|nordstrom|zara|h&m|nike|rei |sephora|apple store|wayfair", "shopping"],
  ["airline|delta|united|southwest|airbnb|hotel|expedia|vrbo|cinema|amc |concert|ticketmaster|steam|nintendo|museum|ski |golf", "fun"],
  ["daycare|school|tuition|petco|petsmart|vet |veterinar|chewy|babysit|toys", "kids"],
  ["transfer to savings|vanguard|fidelity|schwab|401k|roth|brokerage|acorns|betterment|robinhood buy", "savings"],
  ["loan payment|student loan|car payment|auto loan|credit card payment|chase payment|capital one pymt|affirm|klarna", "debt"],
];
const COMPILED = RULES.map(([pat, cat]) => [new RegExp(pat, "i"), cat]);

export function autoCategory(merchant, amount) {
  const text = String(merchant || "");
  for (const [re, cat] of COMPILED) if (re.test(text)) return cat;
  return amount > 0 ? "income" : "other";
}

// Merchants that are almost certainly subscriptions even with a single occurrence
export const KNOWN_SUB_RE = /netflix|spotify|hulu|disney\+|hbo|icloud|youtube premium|prime member|audible|peloton|patreon|substack|nytimes|adobe|dropbox|1password|chatgpt|claude|crunchyroll|paramount|gym|playstation plus|xbox game pass/i;

// Normalize a merchant string for recurring matching ("NETFLIX.COM #1234" → "netflix.com")
export function merchantKey(m) {
  return String(m || "")
    .toLowerCase()
    .replace(/[#*]\s*\d+/g, "")
    .replace(/\d{3,}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
