# DevFlow

![DevFlow overview](docs/overview.png)

DevFlow is a **workflow-as-plugin**: a single CLI orchestrator that runs a full
spec-driven development pipeline for any request (an idea, a bug, a feature, or a
whole new project) and exposes it as one slash command across **Cursor**,
**Claude Code**, and **GitHub Copilot**.

You type `/devflow "<request>"` in your editor; the thin command layer shells out
to the `devflow` CLI, which drives every stage itself and stops for human review
at the PR.

## Pipeline

```
User Request
  → Intent Classification (feature | bug | refactor)
  → Repository Harness (Business / Architecture / Coding Rules)
  → Repo Discovery (auto-detect web/mobile/stack for existing projects)
  → Intake / Clarify (Analyst — gate or --interactive Q&A for vague requests)
  → SpecKit (specification)
  → Requirement Validation (gate)
  → BMAD (planning + task split)
  → Context7 (official docs) + Existing Code
  → Coding Agent
  → Static Validation (unit / integration / lint) (gate)
  → Playwright / Maestro (E2E) (gate)
  → Strix (security validation) (gate)
  → Documentation Agent
  → GitHub PR (with Summary + Test plan)
  → Human Review (pipeline pauses here)
  → Merge (opt-in: `devflow merge`)
```

Each stage has a **preflight** (checks its tool/keys), a **run**, and a **gate**.
If a gating stage fails, the pipeline halts and prints a resume command. Runs are
persisted under `.devflow/runs/<id>/state.json` and are fully resumable.

## Architecture

- **CLI orchestrator** (`devflow`, TypeScript/Node): the source of truth for the
  pipeline. It shells out to real tools and reads their artifacts to gate steps.
- **Agent backend** (pluggable): LLM-dependent stages (intent, spec, plan,
  coding, docs) are driven through `claude -p` (default), `cursor-agent -p`, or a
  direct OpenAI-compatible API. Deterministic stages (lint, tests, Playwright,
  Strix, Context7 fetch, `gh pr create`) are called directly.
- **Command generator**: commands are defined once in `commands/*.yaml` and
  generated into each IDE's native format.

## Install

```bash
# Latest release (recommended)
npm install -g git+https://github.com/iVoGia/devflow-plugin.git#v0.2.2

# Or from this repo (development)
git clone https://github.com/iVoGia/devflow-plugin.git
cd devflow-plugin
npm install && npm run build && npm link
```

Verify:

```bash
devflow --version
```

## Skills & slash commands — hướng dẫn dùng

DevFlow có **3 skill** (slash command). Mỗi skill gọi CLI `devflow` — bạn không cần tự chạy từng stage.

### Tóm tắt nhanh — dùng skill nào?

| Skill | Khi nào dùng | Ví dụ request |
| --- | --- | --- |
| `/devflow-init` | **Lần đầu** gắn DevFlow vào project | *(không cần mô tả thêm)* |
| `/devflow` | Feature mới, ý tưởng, refactor, project greenfield | `Thêm dark mode vào settings` |
| `/devflow-fixbug` | **Sửa bug** trên code đã có | `App crash khi tap Save — expected home, actual SIGABRT` |

**Quy tắc chọn nhanh:**

- Project **chưa có** `.devflow/` → chạy `/devflow-init` trước.
- Có **lỗi / hành vi sai** → `/devflow-fixbug` (nhanh hơn, có 5 Whys, không tốn token phân loại intent).
- **Tính năng mới** hoặc **ý tưởng chưa rõ** → `/devflow`.

---

### Bước 1 — Setup lần đầu (mỗi project một lần)

**1. Cài CLI** (xem [Install](#install) ở trên).

**2. Mở project** trong Cursor / VS Code / terminal, chạy:

| IDE | Lệnh |
| --- | --- |
| **Cursor** | Gõ `/devflow-init` trong chat |
| **Claude Code** | Gõ `/devflow-init` |
| **GitHub Copilot** | Gõ `/devflow-init` trong Chat (agent mode) |
| **Terminal** | `devflow init` |

**3. Điền harness** — mở và viết ngắn gọn vào 3 file:

- `.devflow/knowledge/business.md` — sản phẩm là gì, user là ai
- `.devflow/knowledge/architecture.md` — stack, cấu trúc thư mục
- `.devflow/knowledge/coding-rules.md` — lint, test, quy ước code

**4. Kiểm tra môi trường:**

```bash
devflow doctor
```

Sửa hết mục FAIL trước khi chạy workflow.

---

### Bước 2 — Chạy workflow hàng ngày

#### `/devflow` — feature / ý tưởng / refactor

**Cursor:** chat → `/devflow Thêm màn hình profile với avatar và tên user`

**Claude Code:** `/devflow Thêm màn hình profile với avatar và tên user`

**Copilot:** `/devflow` + mô tả request trong chat

**Terminal:**

```bash
devflow run "Thêm màn hình profile với avatar và tên user"
```

**Request mơ hồ** (project mới, thiếu platform/stack):

```bash
devflow run --interactive "Làm app todo mobile"
# hoặc trong Cursor: mô tả ý tưởng, nếu pipeline dừng ở intake thì trả lời câu hỏi rồi resume
```

**Pipeline đầy đủ:** intent → harness → discover → intake → speckit → validate → bmad → context → coding → static → e2e → strix → docs → **PR** → bạn review → merge.

---

#### `/devflow-fixbug` — sửa bug (pipeline ngắn + 5 Whys)

**Cursor:** `/devflow-fixbug Login crash khi tap Save. Steps: mở app → nhập pass → Save. Expected: home. Actual: crash iOS 17.`

**Claude Code:** `/devflow-fixbug <bug report đầy đủ>`

**Terminal:**

```bash
devflow run --mode fixbug "Login crash khi tap Save. Expected: home. Actual: SIGABRT iOS 17, Flutter 3.22."
```

**Bug report nên có:**

1. **Symptom** — lỗi gì, khi nào xảy ra
2. **Steps to reproduce** — các bước tái hiện
3. **Expected vs actual** — mong đợi gì, thực tế gì
4. **Environment** — OS, version, device (nếu có)

**Pipeline fixbug:** harness → discover → **rootcause (5 Whys)** → context → coding → static → e2e → strix → docs → **PR**.

Khác `/devflow`: **không** phân loại intent (tiết kiệm token), **không** speckit/bmad — thay bằng phân tích root cause `docs/rootcause.md` trước khi code.

---

### Bước 3 — Khi pipeline dừng (gate)

DevFlow **không tự bỏ qua** test/lint. Nếu dừng, terminal in lệnh resume — copy và chạy lại.

| Tình huống | Làm gì |
| --- | --- |
| Dừng ở **intake** (thiếu thông tin) | Trả lời câu hỏi trong chat, rồi: `devflow run --resume latest --from intake "request đã bổ sung đủ"` |
| Intake interactive | `devflow run --resume <id> --from intake --interactive` |
| **Test/lint fail** (static) | Sửa code → `devflow run --resume latest --from static` |
| **E2E fail** | Sửa flow/test → `devflow run --resume latest --from e2e` |
| **PR đã mở** | Review trên GitHub → `devflow merge --squash` (sau khi approve) |

Xem trạng thái run:

```bash
ls .devflow/runs/
cat .devflow/runs/<id>/state.json
```

---

### Bảng so sánh `/devflow` vs `/devflow-fixbug`

| | `/devflow` | `/devflow-fixbug` |
| --- | --- | --- |
| Intent classification | LLM phân loại feature / bug / refactor | **Bỏ qua** — preset bug (tiết kiệm token) |
| Intake / SpecKit / BMAD | Có — spec + plan đầy đủ | **Bỏ qua** — pipeline ngắn |
| Root cause | Tuỳ spec | **5 Whys** (なぜなぜ分析) → `docs/rootcause.md` |
| Branch PR | `feat/` / `fix/` / `refactor/` | Luôn `fix/` |
| Phù hợp | Feature, ý tưởng, refactor, project mới | Bug trên codebase đã có |

---

### Lệnh terminal thường dùng

```bash
devflow init                              # = /devflow-init
devflow doctor                            # kiểm tra tool & API keys
devflow run "..."                         # = /devflow
devflow run --mode fixbug "..."           # = /devflow-fixbug
devflow run --interactive "..."           # intake hỏi trong terminal
devflow run --dry-run "..."               # xem stages sẽ chạy, không thực thi
devflow run --resume latest               # tiếp run sau gate fail
devflow run --resume <id> --from coding   # chạy lại từ stage cụ thể
devflow merge --squash                    # merge PR sau review
devflow generate                          # tạo lại slash commands sau khi update DevFlow
```

---

## Initialize a project

Run inside the target project:

```bash
devflow init
```

*(Tương đương `/devflow-init` trong editor.)*

This scaffolds:

- `.devflow/config.yaml` — pipeline configuration
- `.devflow/knowledge/{business,architecture,coding-rules}.md` — the harness
- `.cursor/commands/devflow.md` + `devflow-fixbug.md` + `devflow-init.md`
- `.claude/commands/` + `.claude/skills/devflow/` + `devflow-fixbug/`
- `.github/prompts/devflow*.prompt.md` — GitHub Copilot

Then fill in the three knowledge files and verify your environment:

```bash
devflow doctor
```

## Usage (CLI reference)

Or directly from the terminal:

```bash
devflow run "Add a dark mode toggle to settings"
devflow run --interactive "Làm app todo"   # Analyst asks questions in terminal first
devflow run --dry-run "..."          # show planned stages only
devflow run --only intent,discover,intake "..."
devflow run --from coding "..."       # start partway through
devflow run --resume latest           # resume after fixing a gate failure
devflow run --resume <id> --from intake --interactive   # answer intake questions
devflow run --resume <id> --from intake "full request with answers"
devflow run --mode fixbug "Login crash on Save tap — expected home screen"
devflow merge --squash                # opt-in merge after review
```

**Fixbug pipeline:**

```
Bug Report
  → Repository Harness
  → Repo Discovery
  → Root Cause Analysis (5 Whys) → docs/rootcause.md
  → Context7 + Existing Code
  → Coding Agent (fix root cause + regression test)
  → Static Validation → E2E → Strix → Docs → PR
```

**Good bug report example:**

```
App crash when tapping Save on login screen.
Steps: open app → enter credentials → tap Save.
Expected: navigate to home. Actual: SIGABRT on iOS 17, Flutter 3.22.
```

## VS Code / Cursor extension

An optional GUI wrapper lives in [`extension/`](extension/). It adds
Command Palette entries (**DevFlow: Start Workflow / Initialize / Doctor /
Resume**), an Activity Bar **Runs** tree view showing each run's 12 stages with
live status, and a status bar summary. It bundles the CLI, so no separate install
is needed inside the editor.

```bash
cd extension
npm install
npm run package        # builds a .vsix
code --install-extension devflow-plugin-*.vsix
```

Publishing to the VS Code Marketplace and Open VSX (for Cursor) is documented in
[extension/PUBLISHING.md](extension/PUBLISHING.md).

## Prerequisites & environment

`devflow doctor` verifies these based on your config:

| Tool | Used by | Install |
| --- | --- | --- |
| Claude Code CLI (`claude`) or Cursor CLI (`cursor-agent`) | agent backend | vendor docs |
| `specify` / `uvx` | SpecKit | `uv tool install specify-cli` |
| Node.js 18+ (`npx`) | BMAD, Playwright | nodejs.org |
| `strix` + Docker | Strix security | `pipx install strix-agent` |
| `gh` (authenticated) | GitHub PR | `gh auth login` |
| `maestro` + Java 17 | E2E (mobile, if enabled) | get.maestro.mobile.dev |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `CONTEXT7_API_KEY` | Higher rate limits for Context7 docs (optional) |
| `STRIX_LLM` | LLM for Strix, e.g. `openai/gpt-5` |
| `LLM_API_KEY` | Provider key for Strix |
| `DEVFLOW_LLM_API_KEY` / `DEVFLOW_LLM_BASE_URL` / `DEVFLOW_LLM_MODEL` | Only for the `api` agent backend |

## Configuration

See `.devflow/config.yaml` (generated by `init`). Highlights:

- `agent: claude | cursor | api` — which backend drives LLM stages. The `api`
  backend cannot edit files, so the coding/docs stages skip themselves under it.
- Each stage can be toggled (`enabled`) and gating stages have a `gate` flag.
- `stages.static.{unit,integration,lint,format}` — leave empty to auto-detect
  from `package.json` scripts.
- `stages.e2e.engine: playwright | maestro | none`.
- `stages.pr.{base,draft,autoMerge}`.

## Development

```bash
npm run dev -- run --dry-run "test"   # run from source via tsx
npm run typecheck
npm run build
```

Project layout:

```
src/
  cli.ts          # commander entry (init, run, doctor, generate, merge)
  config.ts       # zod schema + loader for .devflow/config.yaml
  pipeline.ts     # resumable state machine
  doctor.ts init.ts
  agent/          # claude | cursor | api backends
  stages/         # one file per pipeline stage
  workflow/       # fixbug mode helpers (5 Whys, stage presets)
  util/           # exec, git, fs/glob, which, paths
commands/         # single source of truth (YAML) for slash commands
generators/       # emit Cursor / Claude / Copilot / SKILL.md
templates/        # scaffolded by `devflow init`
```

## License

MIT
