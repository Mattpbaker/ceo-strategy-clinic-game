export interface EventPreset {
  id: string;
  label: string;
  category: "economic" | "social" | "political";
  severity: "low" | "medium" | "high";
  title: string;
  narrative: string;
  effects: {
    cash: number;
    revenue_growth: number;
    market_share: number;
    talent_morale: number;
    operational_resilience: number;
    brand_reputation: number;
    regulatory_risk: number;
  };
}

export const EVENT_PRESETS: EventPreset[] = [
  // Economic (6)
  {
    id: "supply-chain-crisis",
    label: "Supply Chain Crisis",
    category: "economic",
    severity: "high",
    title: "Global Supply Chain Disruption",
    narrative: "A cascade of port closures and logistical failures has broken critical supply chains worldwide. Companies face sharply rising input costs and delayed fulfilment timelines.",
    effects: { cash: -20, revenue_growth: -5, market_share: 0, talent_morale: 0, operational_resilience: -10, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "interest-rate-hike",
    label: "Interest Rate Hike",
    category: "economic",
    severity: "medium",
    title: "Central Bank Rate Increase",
    narrative: "The central bank has raised interest rates by 150 basis points to combat persistent inflation. Borrowing costs rise and consumer spending slows.",
    effects: { cash: -10, revenue_growth: -8, market_share: 0, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "market-crash",
    label: "Market Crash",
    category: "economic",
    severity: "high",
    title: "Equity Market Crash",
    narrative: "A sudden loss of investor confidence has triggered a broad market sell-off. Asset values plunge and corporate credit tightens sharply.",
    effects: { cash: -25, revenue_growth: -12, market_share: -15, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "tech-boom",
    label: "Tech Boom",
    category: "economic",
    severity: "low",
    title: "Technology Investment Surge",
    narrative: "Venture capital and corporate R&D spending are at record highs. Demand for digital products and services is accelerating across every sector.",
    effects: { cash: 0, revenue_growth: 8, market_share: 5, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "inflation-surge",
    label: "Inflation Surge",
    category: "economic",
    severity: "medium",
    title: "Persistent Inflation Wave",
    narrative: "Consumer price inflation is running well above target. Operating costs are rising and discretionary spending is tightening across the economy.",
    effects: { cash: -12, revenue_growth: 0, market_share: 0, talent_morale: -5, operational_resilience: -5, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "trade-war",
    label: "Trade War",
    category: "economic",
    severity: "high",
    title: "Escalating Trade War",
    narrative: "Retaliatory tariffs have been imposed between major trading partners. Import costs surge and export markets contract as supply chains are rerouted.",
    effects: { cash: -10, revenue_growth: -8, market_share: -12, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
  // Social (5)
  {
    id: "labour-strike",
    label: "Labour Strike Wave",
    category: "social",
    severity: "high",
    title: "National Labour Strike Wave",
    narrative: "Coordinated industrial action across multiple sectors has disrupted operations nationwide. Productivity falls and worker demands for wage increases intensify.",
    effects: { cash: 0, revenue_growth: 0, market_share: 0, talent_morale: -15, operational_resilience: -8, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "consumer-boycott",
    label: "Consumer Boycott",
    category: "social",
    severity: "medium",
    title: "Organised Consumer Boycott",
    narrative: "A social media campaign has organised a high-profile consumer boycott targeting corporate practices. Brand perception and sales volume are under pressure.",
    effects: { cash: 0, revenue_growth: 0, market_share: -8, talent_morale: 0, operational_resilience: 0, brand_reputation: -12, regulatory_risk: 0 },
  },
  {
    id: "viral-pr-crisis",
    label: "Viral PR Crisis",
    category: "social",
    severity: "high",
    title: "Viral Public Relations Crisis",
    narrative: "A damaging incident has gone viral, attracting wall-to-wall media coverage. Consumer trust has collapsed and market position is under immediate threat.",
    effects: { cash: 0, revenue_growth: 0, market_share: -10, talent_morale: 0, operational_resilience: 0, brand_reputation: -18, regulatory_risk: 0 },
  },
  {
    id: "talent-shortage",
    label: "Talent Shortage",
    category: "social",
    severity: "medium",
    title: "Critical Talent Shortage",
    narrative: "A tightening labour market has created severe skill gaps in key roles. Hiring timelines stretch and retention costs increase across the sector.",
    effects: { cash: 0, revenue_growth: 0, market_share: 0, talent_morale: -10, operational_resilience: -5, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "community-award",
    label: "Community Award",
    category: "social",
    severity: "low",
    title: "Community Impact Award",
    narrative: "Your company has been publicly recognised for outstanding community contributions. Positive media coverage boosts brand perception and staff pride.",
    effects: { cash: 0, revenue_growth: 0, market_share: 0, talent_morale: 5, operational_resilience: 0, brand_reputation: 10, regulatory_risk: 0 },
  },
  // Political (7)
  {
    id: "regulatory-crackdown",
    label: "Regulatory Crackdown",
    category: "political",
    severity: "high",
    title: "Regulatory Enforcement Crackdown",
    narrative: "Regulators have launched an industry-wide enforcement sweep. Compliance requirements are tightened and fines for breaches increase substantially.",
    effects: { cash: -8, revenue_growth: 0, market_share: 0, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 20 },
  },
  {
    id: "data-privacy-law",
    label: "Data Privacy Law",
    category: "political",
    severity: "medium",
    title: "New Data Privacy Legislation",
    narrative: "A sweeping data privacy law has been passed requiring significant investment in compliance infrastructure and limiting certain data-driven business practices.",
    effects: { cash: -6, revenue_growth: 0, market_share: 0, talent_morale: 0, operational_resilience: -4, brand_reputation: 0, regulatory_risk: 12 },
  },
  {
    id: "election-uncertainty",
    label: "Election Uncertainty",
    category: "political",
    severity: "medium",
    title: "Election Uncertainty",
    narrative: "An upcoming election has created significant policy uncertainty. Business investment slows and consumer confidence dips as the outcome remains unclear.",
    effects: { cash: 0, revenue_growth: -4, market_share: -6, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "govt-subsidy",
    label: "Government Subsidy",
    category: "political",
    severity: "low",
    title: "Government Subsidy Program",
    narrative: "The government has announced a targeted subsidy program to stimulate business investment. Eligible companies benefit from direct cash injections and reduced operating costs.",
    effects: { cash: 15, revenue_growth: 5, market_share: 0, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
  {
    id: "antitrust-probe",
    label: "Antitrust Probe",
    category: "political",
    severity: "high",
    title: "Antitrust Investigation",
    narrative: "Regulators have opened a formal antitrust investigation into market concentration. Legal costs rise, strategic options narrow and brand credibility takes a hit.",
    effects: { cash: 0, revenue_growth: 0, market_share: -8, talent_morale: 0, operational_resilience: 0, brand_reputation: -6, regulatory_risk: 18 },
  },
  {
    id: "green-regulation",
    label: "Green Regulation",
    category: "political",
    severity: "medium",
    title: "Green Transition Regulation",
    narrative: "New environmental regulations require companies to meet stricter sustainability targets. Compliance costs rise but companies that adapt early earn a brand premium.",
    effects: { cash: 0, revenue_growth: 0, market_share: 0, talent_morale: 0, operational_resilience: -5, brand_reputation: 4, regulatory_risk: 10 },
  },
  {
    id: "trade-agreement",
    label: "Trade Agreement",
    category: "political",
    severity: "low",
    title: "New Trade Agreement",
    narrative: "A landmark bilateral trade agreement has been signed, reducing tariffs and opening new export markets for domestic companies.",
    effects: { cash: 0, revenue_growth: 6, market_share: 8, talent_morale: 0, operational_resilience: 0, brand_reputation: 0, regulatory_risk: 0 },
  },
];
