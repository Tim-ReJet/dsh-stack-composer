# dsh-stack-composer

Compose a working stack of DeepSeek Harness plugins for a purpose. Ask for *"a fully equipped DevOps
stack"* or *"a content creation stack for a solo YouTube channel"* and it works out the roles that
purpose needs, scores every plugin in the curated [`dsh-plugin` registry](https://awesome-dsh-plugin.com)
against each role using the categories, descriptions, capability flags and red lines the registry
publishes, and returns the picks with the signals that chose them, the risks, the roles it could not
fill, and one install command per plugin.

It installs nothing and changes nothing it reports on. Its only write is its own registry cache
under the DSH home, and it makes no network request unless it needs the registry.

## What it reasons over

The curated registry is 4,412 plugin entries (2026-10-04) with, per entry: a category, a one-line
description, an `install` command, star and download counts, the ten capability flags its source was
checked against (`fs-read`, `fs-write`, `env`, `network`, `llm`, `shell`, `dynamic-code`,
`host-runtime`, `credentials`, `subagent`), and any red lines that check raised.

No plugin source is fetched. A capability flag is what the registry recorded, and a missing flag means
the check did not observe the behaviour — **not** that the plugin is safe.

## How a stack is composed

1. **Purpose → roles.** 23 roles describe jobs a stack does (version control, containers, secrets,
   observability, alerting, capture, publishing, memory, orchestration, …). A purpose matching one of
   8 presets takes that preset's roles; otherwise roles are chosen by how many of their keywords the
   purpose uses, and filled out with generic roles so a vague purpose still yields something usable.
2. **Every plugin scored against every role.** The scoring is additive, and each contribution is
   kept as a printed reason:

   | Signal | Weight |
   | --- | --- |
   | category is one the role names | +6 |
   | each of up to 2 role keywords in the name | +5 |
   | each of up to 3 further role keywords in the description | +2 |
   | a capability the role wants, declared | +2 |
   | a capability the role wants, not declared | −1 |
   | each of up to 2 "this is about a different job" fragments | −4 |
   | popularity | +log₁₀ tiebreak, capped at +4 |

3. **Thresholds.** A role at 6 or more is filled; between 3 and 6 it is shown as a loose match;
   below 3 the role is reported as a **gap** with the nearest candidate named. A stack is never
   padded to look complete.
4. **Assembly.** A plugin is picked once even when several roles want it; risk notes come from the
   red lines the registry recorded; the report lists the capability union, the flags worth reviewing
   before installing, and one install command per plugin.

```
$ dsh-stack-composer "a fully equipped DevOps stack" --per-role 1
stack: a fully equipped DevOps stack
preset: DevOps / platform (devops) · 9 roles · 9 plugins · registry: 4412 entries, updated 2026-10-01

1. Version control and review — Track changes, inspect diffs, and review work before it lands [ok]
   • HaoyueQin/dsh-git-review — git — score 24.11
     Review tab for DeepSeek Harness sessions: workspace changes versus HEAD or any two refs as a
     filterable file tree with side-by-side diffs, …
     why: category git; name contains "git"; name contains "review"; description mentions "commit"
     capabilities: runs shell commands, writes files, reads files, makes network requests, reads environment variables
     install: dsh plugin --profile web add dsh-git-review
…
risk notes
   ! Ox0400/dsh-vault: reads credentials or secrets and has network access
```

Two stacks composed from the live registry are committed as evidence:
[DevOps](samples/a-fully-equipped-devops-stack.txt) ·
[content creation](samples/a-content-creation-stack-for-a-solo-youtube-channel.txt). Regenerate them
with `npm run check:live`.

## Install

```sh
dsh plugin --profile web add dsh-stack-composer
# from this repository, before any npm release:
dsh plugin --profile web add github:Tim-ReJet/dsh-stack-composer
```

Confirm the layer composed:

```sh
dsh --profile web --dump-config | grep -A 5 stack-composer
```

For local development against a source checkout:

```yaml
# composer.overlay.yml
- insert:
    - id: stack-composer
      name: '/absolute/path/to/dsh-stack-composer/src/index.js'
      config:
        perRole: 2
```

## Use

Two tools, from any session where the plugin is composed:

- **`stack_compose`** — `purpose` (required), `perRole`, `refresh`. Returns the stack, its roles and
  counts, and the full report.
- **`plugin_capabilities`** — `query` (required), `limit`, `category`, `capability`. Reports what
  matching plugins do, their capability flags, red lines, install command, and page. Use it to reason
  about individual plugins before choosing.

Try, in a session: *"Compose a security review stack and tell me which picks read credentials."*

The CLI runs the same engine:

```sh
dsh-stack-composer "a fully equipped DevOps stack" --per-role 2
dsh-stack-composer "a content creation stack" --json > stack.json
dsh-stack-composer --capabilities "browser automation" --limit 5
dsh-stack-composer --capabilities "secrets" --capability credentials
dsh-stack-composer --presets        # list the 8 presets
dsh-stack-composer --roles          # list the 23 roles
```

| Flag | Effect |
| --- | --- |
| `--per-role <n>` | plugins offered per role (default 2) |
| `--refresh` | refetch the registry instead of using the day-old cache |
| `--offline` | never fetch; use the cache, or fail if there is none |
| `--registry <path\|url>` | read the registry from here instead (a local file is never cached) |
| `--json` | print the composed stack as JSON |
| `--capabilities <query>` | report plugin capabilities instead of composing |
| `--category`, `--capability`, `--limit` | filter `--capabilities` |
| `--out <file>` | write the report to a file |

Exit status is 0 on success and 2 on a usage error or an unreadable registry.

## Configuration

`dsh.bundle.patch` points here: `cordis.patch.yml` inserts one row, `stack-composer`, with
`perRole`, `registryUrl`, `registryPath` (a local snapshot, for tests or an air-gapped machine) and
`offline`.

## Limits worth knowing

- **The lexicon is the weak part, and it is data.** `src/roles.js` holds the roles, their keywords,
  what they deliberately do not want, and the presets. Keyword matching has false friends — a
  language-specific writing plugin can outrank a general one, and the registry's `usage` category is
  mostly about the harness's own tokens, not an audience. The report prints the reasons for every
  pick, so a wrong pick is a vocabulary bug you can fix in one file rather than a black box.
- **Nothing here reads plugin source.** Capability flags are the registry's own observations.
- **It is not a quality ranking.** Stars and downloads only break ties, and "in the registry at all"
  is the only quality signal the composer inherits.
- **It does not install anything**, and it does not check whether two picks conflict.

## Verification

- `npm test` runs 37 tests on `node:test`, with no network: scoring, dedupe, gaps, risk notes,
  monorepo slugs, capability search, registry caching and offline behaviour, and the host tool seam
  from a local snapshot.
- `npm run check:live` composes both sample stacks from the live registry and writes them to
  `samples/`.
- `npm run verify:install` installs `github:Tim-ReJet/dsh-stack-composer` into a throwaway DSH home
  and asserts the bundle layer composed (network required).
- End to end in a real harness with a model calling the tools, on harness `0.1.1-rc.2` and
  `0.2.0-rc.2`.

## Getting listed

The directory is [`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).
This repository carries the `dsh-plugin` topic; a listing takes one entry file in a pull request
(`data/plugins/Tim-ReJet__dsh-stack-composer.yml`).

## License

MIT
