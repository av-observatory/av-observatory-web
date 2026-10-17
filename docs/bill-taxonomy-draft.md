# Bill taxonomy: DRAFT for review

Status: draft, nothing built on it yet. Edit freely; the tagging pipeline will follow whatever we agree here.

## How it works

Every bill gets one or more **tags**. A tag has three parts:

1. **Sub-topic** (level 2, belongs to one level-1 topic). This is what counts roll up from.
2. **Direction**, judged on that sub-topic's own axis (see axis types), with a quoted line from the bill text as evidence.
3. **Mechanism**: how the bill does it (tax incentive, permitting streamlining, ban, licensing, disclosure, funding, preemption of local rules, study or task force, and so on).

Funding is a separate field on the tag: increases / decreases / none.

A bill can carry several tags, each with its own direction. A data center bill can be *enables* on Data centers and *loosens* on Environmental permitting at the same time.

Counting by high-level topic = number of bills with at least one tag under that topic. Legislator profiles = per sub-topic counts of sponsored/co-sponsored (later: voted for) bills by direction.

### Axis types

| Code | Axis | Poles |
|---|---|---|
| **A** | Access / rights | expands ←→ restricts |
| **R** | Regulation | tightens ←→ loosens |
| **F** | Funding only | direction not meaningful; funding field carries it |
| **N** | None | counted and described, no direction |

Directions are written from what the bill *does*, never from a viewpoint. Scale: strongly / moderately toward each pole, mixed, neutral (procedural or no real effect), unclear (text does not say).

## The tree

### 1. Health care
| Sub-topic | Axis |
|---|---|
| Reproductive health and abortion | A |
| Gender-affirming and transgender health care | A |
| Medicaid and public coverage | A |
| Private insurance rules and mandates | R |
| Drug pricing and pharmacy | R |
| Hospitals and providers (certificate of need, scope of practice) | R |
| Mental health and substance use treatment | A |
| Public health, vaccines and emergency measures | R |
| Long-term care and disability services | A |
| Health care workforce and funding | F |

### 2. Guns and weapons
| Sub-topic | Axis |
|---|---|
| Firearm ownership and carry (permitless carry, concealed carry) | A |
| Background checks and licensing | R |
| Weapon and magazine types (assault weapons, ghost guns) | R |
| Safe storage and child access | R |
| Extreme risk protection orders ("red flag") | R |
| Firearms in schools and public places | R |
| Dealers, ammunition and manufacturing | R |
| Violence prevention programs | F |

### 3. Children and families
| Sub-topic | Axis |
|---|---|
| Child welfare and foster care | R |
| Child care and early education | A |
| Parental rights | A |
| Kids' online safety and age verification | R |
| Juvenile justice | R |
| Child support, custody and family law | N |
| Paid family leave and family benefits | A |
| Children's programs and funding | F |

### 4. Housing
| Sub-topic | Axis |
|---|---|
| Zoning and land use | R |
| Rent regulation and tenant protections | R |
| Affordable housing programs | F |
| Homelessness (services vs. encampment rules) | A |
| Short-term rentals | R |
| Building codes and construction | R |
| Mortgage, ownership and property transactions | N |

### 5. AI and technology
| Sub-topic | Axis |
|---|---|
| AI safety and oversight | R |
| AI development and adoption (incentives vs. burdens) | A |
| Government use of AI | A |
| Deepfakes and synthetic media | R |
| AI in employment and consumer decisions | R |
| Data centers and compute | A |
| Data privacy | R |
| Social media and online platforms | R |
| Cybersecurity | R |
| Broadband and telecom | A |

### 6. Education
| Sub-topic | Axis |
|---|---|
| K-12 funding | F |
| School choice and vouchers | A |
| Curriculum and classroom content | R |
| Higher education (tuition, tenure, DEI) | R |
| Teacher workforce and pay | F |
| School safety and discipline | R |
| Phones and technology in schools | R |

### 7. Taxes and budget
| Sub-topic | Axis |
|---|---|
| Income taxes | F |
| Property taxes | F |
| Sales and excise taxes | F |
| Business tax incentives and credits | F |
| State budget and appropriations | F |
| Bonds, debt and pensions funding | F |

For this topic the *revenue effect* (increases / decreases) is the signal; there is no enable/restrict direction.

### 8. Elections and voting
| Sub-topic | Axis |
|---|---|
| Voter registration and access (mail voting, early voting) | A |
| Voter ID and election security | R |
| Redistricting | N |
| Campaign finance | R |
| Election administration and officials | N |
| Ballot measures and initiatives | A |

### 9. Transportation
| Sub-topic | Axis |
|---|---|
| Autonomous vehicles | A |
| Traffic safety and enforcement (speed cameras, DUI) | R |
| Electric vehicles and charging | A |
| Rideshare, scooters and micromobility | R |
| Drones and aviation | R |
| Transit and infrastructure funding | F |
| Vehicle registration, licensing and fees | N |

### 10. Environment and energy
| Sub-topic | Axis |
|---|---|
| Climate and emissions | R |
| Renewable energy and storage | A |
| Fossil fuels, pipelines and mining | A |
| Nuclear power | A |
| Utility regulation and rates | R |
| Environmental permitting and review | R |
| Water, land and wildlife protection | R |
| Public lands and conservation funding | F |

### 11. Criminal justice
| Sub-topic | Axis |
|---|---|
| Sentencing and penalties | R |
| Policing and accountability | R |
| Bail and pretrial | R |
| Drug policy (cannabis, decriminalization) | A |
| Corrections and reentry | A |
| Courts and procedure | N |
| Victims' rights | A |

### 12. Labor and employment
| Sub-topic | Axis |
|---|---|
| Minimum wage and wage rules | R |
| Unions and collective bargaining | A |
| Worker safety and protections | R |
| Paid leave and benefits | A |
| Unemployment insurance | A |
| Gig work and independent contractors | R |
| Occupational licensing | R |

### 13. Immigration
| Sub-topic | Axis |
|---|---|
| State cooperation with federal enforcement | R |
| Benefits and services for immigrants | A |
| Employment verification | R |
| In-state tuition and education access | A |

### 14. Civil rights and liberties
| Sub-topic | Axis |
|---|---|
| Anti-discrimination protections (incl. LGBTQ) | A |
| Religious liberty | A |
| Free speech and assembly | A |
| Diversity, equity and inclusion programs | R |
| Gender identity policies (non-medical) | A |
| Records, surveillance and civil liberties | R |

### 15. Consumer protection and business
| Sub-topic | Axis |
|---|---|
| Consumer protection and fees | R |
| Insurance market regulation | R |
| Banking, lending and crypto | R |
| Business licensing and regulation | R |
| Gambling and sports betting | A |
| Alcohol, tobacco and vaping | R |
| Agriculture and food | R |

### 16. Government administration
| Sub-topic | Axis |
|---|---|
| Ceremonial and commemorative measures | N |
| State agencies and structure | N |
| Public employees and pensions | F |
| Local government powers and preemption | A |
| Ethics and transparency | R |
| Constitutional amendments and resolutions | N |
| Emergency powers | R |

About 95 sub-topics under 16 topics.

## Cross-tagging rules

- Tag by what the bill actually does, not by where it is filed. One bill can carry tags under several topics.
- A sub-topic belongs to one parent for counting, but a bill may be tagged on sub-topics under different parents.
- Kids' online safety lives under Children and families; Data privacy and Social media live under AI and technology. A bill on children's data gets tags in both.
- Gender-affirming care is tagged under Health care; school policies on gender identity under Civil rights; a bill doing both gets both.
- Data center bills: tag Data centers (direction and mechanism) and, when they change permitting, utility or water rules, tag those too.
- Ceremonial measures (naming, commemorations) get the Government administration tag and no other.

## Legislator profiles (derived from actions)

- Per legislator and sub-topic: bills sponsored / co-sponsored (later: voted for), by direction, with links to the bills.
- A summary label such as "leans restrictive" would appear only above a minimum number of bills and would show that number.
- The first version uses sponsorship only and says so.

## Open questions for review

1. Should Abortion, Gender-affirming care or Data centers be promoted to level-1 topics?
2. Any sub-topics to add, merge or remove?
3. Is the A / R / F / N axis split right, or should some sub-topics have both access and regulation poles?
4. Should the AV pilot keep Autonomous vehicles under Transportation (as drafted) or sit on its own?
5. Direction scale: five points (strongly / moderately each way plus mixed) or three (expands / restricts / mixed)?
