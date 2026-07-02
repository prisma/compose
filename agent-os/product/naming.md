# Product Naming & Distribution

How the product and its pieces are named, and how developers get and compose them.
Some renames below are still proposed (noted inline); the building block and
registry names are settled.

## How we choose names

**Name for user value — the thing the developer cares about — not the machinery
that delivers it.** Every layer has two nouns: the one the user is emotionally
invested in and would say out loud, and the precise internal term for how it works.
The brand takes the first; the second stays underneath, unnamed in the marketing but
kept exact as a sub-concept.

Four tests decide a name:

1. **Would the user say it about their own work?** "My app." "My data." If they'd
   put "my" in front of it, it's a value noun. They would not say "my topology" or
   "my contract" — those are ours, not theirs.
2. **Does it predict the tooling?** A good name tells you what you'll find before you
   arrive. "Data" implies model, migrate, query, types. A clever coinage implies
   nothing.
3. **Does it name the goal, not the tax?** People value data *access*; migration is
   a necessary step, sometimes an obstacle, never the goal. Name the product after
   the reward, not the chore.
4. **Does it keep the family legible?** Components are named for their role so the
   set reads as a parts-list of one app. The aggregate — a whole app built from
   Prisma components — is worth more than any single clever standalone name.

The payoff of taking the value noun for the brand is that the precise words stay
**free to keep their exact meaning as sub-concepts.** Naming a product after its
machinery steals a word that is more useful one level down. The same shape repeats
at every layer:

| Product (user value) | Authored as | Compiles / resolves to |
|---|---|---|
| **App** — "my application" | **Hexes** you snap together | a **Topology** |
| **Prisma Data** — "my data" | **models** in PSL | a **Contract** |

Read either row left to right and it's the same story: the user names the left
column, writes the middle, and the system consumes the right.

## The names

| Name | Kind | The value it names |
|---|---|---|
| **App** | hero noun | The single application a developer builds — the thing with users and features. Kept plain and front; never renamed. |
| **Hex** | unit | A capability you snap in rather than build — "an auth hex." Value: reuse. |
| **Hexicon** | registry | Where you find and trust building blocks — "it's on Hexicon." Value: discovery, trust, one-command install. |
| **Prisma Data** | layer | "My data" — model it, query it, access it, manage it. Value: data access. Rename of Prisma Next — *proposed*. |
| **Prisma Compose** | tool | Your app coming together from parts, without hand-wiring infra. Rename of MakerKit — *proposed*. |
| **Topology** | internal | The wired graph a Compose produces. Machinery — never user-facing vocabulary. |

## The value in each layer

- **App** — the developer's actual goal: software with users and features. It never
  needs teaching, so it stays the hero noun. The machinery beneath it (Topology, the
  composition graph) is real but is not what anyone set out to make.
- **Hex** — the value is *not building it yourself*. A Hex is a bounded context with
  typed inputs/outputs that behaves like a service, so a stranger's auth Hex drops in
  with a boundary the machine can check. Giving the shared unit its own short noun
  follows the tradition of a gem, a crate, a package.
- **Hexicon** — the value is *finding and trusting* those blocks. In a
  compose-from-blocks product the registry is the highest-leverage name in the
  system: it becomes the verb developers type, the destination they return to, the
  network-effect asset (a Hex is published *to* somewhere and is *on* somewhere), the
  trust mark for stranger-published Hexes, and — when the composer is an agent — the
  agent's app store.
- **Prisma Data** — the value is *my data*: modeling it, and above all accessing and
  querying it. This is why the layer is named **Data**, not "Model" or "Contract."
  Modeling and migration are the way in, not the goal — you don't brand a product
  after the tax it charges. And naming the product "Data" frees the two precise words
  to keep their jobs: you still author **models** in PSL (the beloved part of Prisma,
  untouched), and those models still compile to a **Contract** — the typed data
  boundary a Hex's input requires and a Postgres output satisfies. Data is the value;
  model is what you write; Contract is what the system wires against.
- **Prisma Compose** — the value is *the app coming together* without wiring
  infrastructure by hand. It composes Hexes into the app; the topology it infers is
  the machinery, not the pitch.

## The registry: Hexicon

"Hex" + "lexicon" — the catalog of Hexes. The name sidesteps two collisions that
bare "Hex" would hit: `hex.pm`, the Elixir/Erlang package manager (a same-category
registry, the most confusing kind of clash), and `hex.tech`, an established
data-tools brand.

## Distribution model

Hosting and discovery are split:

- **Hosting → npm.** Hexes are normal TypeScript libraries. npm brings semver,
  resolution, and tooling for free; the substrate stays boring and commodity.
- **Discovery → Hexicon.** A thin, named directory on top: search, ranking, trust,
  and a one-command install.

This follows the shape proven by skills.sh — decentralized hosting plus a named
central directory plus one-command install — with one deliberate difference:
**Hexicon's install composes, it doesn't just copy.** skills.sh drops text files
into an agent's config; Hexicon wires a Hex's typed contract into the app's
topology. That richer install is the point, and it depends on the typed-contract
model being sound.

Because community Hexes are arbitrary npm packages, Hexicon needs an indexing
convention (a `keywords` entry or a manifest field) to recognize a package as a Hex.

## The Prisma product family

A developer builds their app by composing Prisma components, each named for its
role. Read down the value column and it enumerates what building an app is *for*:

| Component | Role | The value to the user |
|---|---|---|
| Prisma Postgres | persist | my data has a home |
| Prisma Compute | execute | my code runs |
| Prisma Data *(← Prisma Next)* | data | I model, access, and manage my data |
| Prisma Compose *(← MakerKit)* | system | my app comes together from parts |
| Durable Streams | stream | my events flow and survive |
| Connection | connect | my services reach each other |

Note the product name need not equal the role word — Compute's role is "execute,"
Compose's role is "system." So "Prisma Data" naming the data layer is consistent
with the family even though its role is data modeling.

## Names to avoid

- **Bare "Hex" as the registry** — collides with `hex.pm` and `hex.tech`. Keep
  "Hex" for the *unit*; the registry has its own name (as gem→RubyGems,
  crate→crates.io, package→npm).
- **"Hexal" as a public, domain-fronted brand** — its domains are camped or guarded
  by Hexal AG (a pharmaceutical company; owns `hexal.com`). The `@hexal` npm org is
  registered but not the plan.
- **Naming the data layer "Model" or "Contract"** — both steal a word that is more
  useful one level down (`model` is the PSL construct developers love; a `Contract`
  is what models compile to). "Model" also names the authoring step, and "Contract"
  the machinery — neither names the user's actual value, which is data access.
