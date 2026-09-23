import { surveyBriefs } from "./statePolicySurvey";

export type PolicyBrief = {
  framework: string;
  analysis: string;
  oversight: string;
  sources: { label: string; url: string }[];
  reviewed: string;
};

export const policyBriefs: Record<string, PolicyBrief> = {
  ...surveyBriefs,
  CA: {
    framework: "Separate testing and deployment permits",
    analysis: "California distinguishes testing with a safety driver, driverless testing, and deployment. A state permit is not itself evidence of an active passenger service or a statewide ODD. Passenger service also has CPUC oversight.",
    oversight: "DMV permits and reporting; CPUC passenger-service authorization and reporting.",
    sources: [
      { label: "California DMV AV program", url: "https://www.dmv.ca.gov/portal/vehicle-industry-services/autonomous-vehicles/" },
      { label: "California CPUC AV program", url: "https://www.cpuc.ca.gov/regulatory-services/licensing/transportation-licensing-and-analysis-branch/autonomous-vehicle-programs" },
    ], reviewed: "September 2026",
  },
  TX: {
    framework: "Commercial operation authorization",
    analysis: "Texas authorized AV operation in 2017 and added a mandatory TxDMV authorization for commercial automated-vehicle operation in 2026. The state does not publish a complete public holder roster in the sources reviewed; documented service is distinct from authorization.",
    oversight: "TxDMV commercial authorization; traffic-law and insurance requirements.",
    sources: [{ label: "TxDMV AV program", url: "https://www.txdmv.gov/AVprogram" }, { label: "Texas AV statute", url: "https://texas.public.law/statutes/tex._transp._code_section_545.453" }], reviewed: "September 2026",
  },
  AZ: {
    framework: "Notification and certification",
    analysis: "Arizona's AV framework grew from executive orders in 2015 and 2018. The state provides notification and certification guidance before testing and operation. A company operating in Arizona should not be interpreted as having statewide service coverage.",
    oversight: "Arizona MVD notification and certification.",
    sources: [{ label: "Arizona DOT AV guidance", url: "https://azdot.gov/mvd/services/professional-services/autonomous-vehicles-testing-and-operating-state-arizona" }], reviewed: "September 2026",
  },
  NV: {
    framework: "Testing and operation registries",
    analysis: "Nevada provides separate DMV applications for autonomous-vehicle testing and certification for operation. No complete public list of current holders was found in the sources reviewed.",
    oversight: "Nevada DMV testing and operation certification.",
    sources: [{ label: "Nevada DMV AV program", url: "https://dmv.nv.gov/autonomous.htm" }], reviewed: "September 2026",
  },
  FL: {
    framework: "Statutory operation pathway",
    analysis: "Florida law allows driverless AV operation subject to statutory conditions. This review has not established a separate public company-level permit roster; a service announcement is not a state-issued ODD boundary.",
    oversight: "Vehicle registration and statutory operating requirements.",
    sources: [{ label: "Florida AV statute", url: "https://www.flsenate.gov/Laws/Statutes/2025/316.85" }], reviewed: "September 2026",
  },
  NY: {
    framework: "State demonstration permit; additional NYC test permit",
    analysis: "Testing in New York City requires a New York State DMV demonstration or testing permit and a separate NYC DOT permit. A NYC testing permit does not authorize commercial passenger service.",
    oversight: "NYS DMV demonstration program; NYC DOT testing permit within the city.",
    sources: [{ label: "NYC DOT AV testing", url: "https://www.nyc.gov/html/dot/html/motorist/autonomous-vehicles.shtml" }], reviewed: "September 2026",
  },
  MA: {
    framework: "State-approved testing program",
    analysis: "Massachusetts Executive Order 572 established a framework for testing highly automated driving technologies. State guidance describes an approval process for testing; it should not be treated as an unrestricted deployment permit.",
    oversight: "MassDOT testing review and safety requirements.",
    sources: [{ label: "Massachusetts self-driving systems", url: "https://www.mass.gov/self-driving-systems-in-massachusetts" }], reviewed: "September 2026",
  },
  WA: {
    framework: "Testing self-certification and vehicle registration",
    analysis: "Washington distinguishes eligibility to test AVs on public roads from registration of the vehicle itself. Neither alone identifies an operating service area.",
    oversight: "State testing self-certification and vehicle registration processes.",
    sources: [{ label: "Washington DOL registration guidance", url: "https://dol.wa.gov/vehicles-and-boats/vehicles/vehicle-registration/register-other-vehicles-and-other-services/registering-autonomous-vehicles" }], reviewed: "September 2026",
  },
  GA: {
    framework: "ADS-specific statutory framework",
    analysis: "Georgia enacted rules for fully autonomous vehicles through SB 219. The Observatory has operating evidence, but has not located a public state holder roster; the statute and an operator's actual service geography answer different questions.",
    oversight: "State motor vehicle law and applicable service regulation.",
    sources: [{ label: "Georgia SB 219", url: "https://www.legis.ga.gov/Legislation/20172018/170801.pdf" }], reviewed: "September 2026",
  },
};
export const NATIONAL_POLICY_SOURCE = "https://www.ncsl.org/transportation/autonomous-vehicles-legislation-database";
