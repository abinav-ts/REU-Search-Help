#!/usr/bin/env python3
"""Turn a Claude Code session log (JSONL) into a standalone HTML page:
"Turn 1, Turn 2, ..." for each human message, with Claude's reply collapsed underneath.

    python3 scripts/build-transcript.py <session.jsonl> docs/transcript.html "Page title"

Personal details are scrubbed AT RUN TIME from what the machine knows (home folder name, git name /
email / remote, workers.dev subdomain), so this file itself contains no personal data. Tool OUTPUTS are
never included, only a one-line description of each action; thinking blocks are left out.
"""
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path

src, out, title = Path(sys.argv[1]), Path(sys.argv[2]), (sys.argv[3] if len(sys.argv) > 3 else "Build transcript")
repo = Path(__file__).resolve().parent.parent


def sh(*cmd):
    try:
        return subprocess.run(cmd, cwd=repo, capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        return ""


# ---------- scrubbing ----------
home_user = Path.home().name
git_name, git_email = sh("git", "config", "user.name"), sh("git", "config", "user.email")
remote = sh("git", "remote", "get-url", "origin")
gh_user = (re.search(r"github\.com[:/]([^/]+)/", remote) or [None, ""])[1]
names = {n for n in [home_user, git_name, gh_user, git_name.split()[0] if git_name else ""] if n and len(n) > 2}
# the second half of a "firstname lastinitials" style handle (e.g. first-name-initials) is covered by the handles above
SCRUBS = [
    (re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+"), "[email]"),
    (re.compile(r"https://claude\.ai/code/session_\w+"), "[session-link]"),
    (re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b"), "[id]"),
    (re.compile(r"\b[0-9a-f]{32}\b"), "[id]"),
    (re.compile(r"(reu-brief)\.[a-z0-9-]+\.workers\.dev", re.I), r"\1.[your-subdomain].workers.dev"),
    (re.compile(r"gh[opusr]_\w{6,}"), "[token]"),
    (re.compile(r"(AIza|fc-)[\w-]{10,}"), "[key]"),
    (re.compile(r"claude-\d{3}"), "claude-[uid]"),
    (re.compile(r"MacBook[\w-]*", re.I), "[host]"),
]
# extra words to hide, given at run time so they never sit in this file:  SCRUB_EXTRA="Some Project,Some Course"
for word in filter(None, (w.strip() for w in os.environ.get("SCRUB_EXTRA", "").split(","))):
    SCRUBS.append((re.compile(re.escape(word), re.I), "[removed]"))


def scrub(text: str) -> str:
    text = text.replace(str(Path.home()), "~")
    text = text.replace(f"/Users/{home_user}", "/Users/[user]")
    for pat, rep in SCRUBS:
        text = pat.sub(rep, text)
    for n in sorted(names, key=len, reverse=True):
        text = re.sub(re.escape(n).replace(r"\-", "[-_ ]?"), "[owner]", text, flags=re.I)
    # short handles derived from the names above
    for n in list(names):
        stem = re.sub(r"[^a-z]", "", n.lower())
        if len(stem) > 4:
            text = re.sub(re.escape(stem[:6]) + r"[a-z0-9-]*", "[owner]", text, flags=re.I)
    return text


# ---------- reading the log ----------
NOISE = re.compile(r"<(system-reminder|local-command-caveat|local-command-stdout|command-name|command-message|command-args|task-notification|pasted_content)\b.*?</\1>", re.S)
rows = [json.loads(l) for l in src.read_text().splitlines() if l.strip()]


def user_text(r):
    c = r["message"]["content"]
    if isinstance(c, str):
        return c
    if any(b.get("type") == "tool_result" for b in c):
        return None
    return "\n".join(b.get("text", "") for b in c if b.get("type") == "text")


def describe(block):
    n, i = block.get("name", "tool"), block.get("input", {})
    if n == "Bash":
        return f"Ran a command: {i.get('description') or i.get('command', '')[:80]}"
    if n in ("Edit", "Write", "Read", "NotebookEdit"):
        return f"{n}: {i.get('file_path', '')}"
    if n in ("WebSearch", "WebFetch"):
        return f"{n}: {i.get('query') or i.get('url', '')}"
    if n == "Artifact":
        return "Artifact tool"
    return n


turns = []  # each: {"user": str, "kind": "chat"|"shell", "text": [str], "actions": [str]}
pending_shell = None
for r in rows:
    if r.get("type") == "user":
        t = user_text(r)
        if t is None:
            continue
        raw = t
        m_in = re.search(r"<bash-input>(.*?)</bash-input>", raw, re.S)
        m_out = re.search(r"<bash-stdout>(.*?)</bash-stdout>", raw, re.S)
        if m_in:
            pending_shell = {"cmd": m_in.group(1).strip(), "out": ""}
            continue
        if m_out and pending_shell is not None:
            pending_shell["out"] = m_out.group(1).strip()
            body = f"$ {pending_shell['cmd']}\n{pending_shell['out'][:1200]}" + (" …" if len(pending_shell["out"]) > 1200 else "")
            turns.append({"user": body, "kind": "shell", "text": [], "actions": []})
            pending_shell = None
            continue
        if m_out:  # stdout with no matching input: ignore
            continue
        cleaned = NOISE.sub("", raw).strip()
        if not cleaned or cleaned.startswith("[Request interrupted"):
            continue
        if turns and turns[-1]["kind"] == "chat" and turns[-1]["user"] == cleaned and not turns[-1]["text"]:
            continue  # the same message re-sent after a /login prompt
        turns.append({"user": cleaned, "kind": "chat", "text": [], "actions": []})
    elif r.get("type") == "assistant" and turns:
        for b in r["message"]["content"]:
            if b.get("type") == "text" and b["text"].strip():
                turns[-1]["text"].append(b["text"].strip())
            elif b.get("type") == "tool_use":
                turns[-1]["actions"].append(describe(b))


# ---------- tiny markdown renderer (safe: everything is escaped first) ----------
def inline(s):
    s = html.escape(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*([^*\n]+)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" rel="noopener noreferrer">\1</a>', s)
    return s


def md(text):
    lines, out, i = text.split("\n"), [], 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("```"):
            j, buf = i + 1, []
            while j < len(lines) and not lines[j].startswith("```"):
                buf.append(lines[j]); j += 1
            out.append("<pre><code>" + html.escape("\n".join(buf)) + "</code></pre>")
            i = j + 1
        elif re.match(r"^#{1,4} ", ln):
            lvl = min(len(ln) - len(ln.lstrip("#")) + 2, 6)
            out.append(f"<h{lvl}>{inline(ln.lstrip('# ').strip())}</h{lvl}>"); i += 1
        elif "|" in ln and i + 1 < len(lines) and re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", lines[i + 1]):
            head = [c.strip() for c in ln.strip().strip("|").split("|")]
            j, rows_ = i + 2, []
            while j < len(lines) and "|" in lines[j]:
                rows_.append([c.strip() for c in lines[j].strip().strip("|").split("|")]); j += 1
            out.append("<div class='tw'><table><thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r_) + "</tr>" for r_ in rows_) + "</tbody></table></div>")
            i = j
        elif re.match(r"^\s*([-*]|\d+\.) ", ln):
            ordered = bool(re.match(r"^\s*\d+\. ", ln))
            j, items = i, []
            while j < len(lines) and re.match(r"^\s*([-*]|\d+\.) ", lines[j]):
                items.append(re.sub(r"^\s*([-*]|\d+\.) ", "", lines[j])); j += 1
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items) + f"</{tag}>")
            i = j
        elif ln.startswith(">"):
            j, buf = i, []
            while j < len(lines) and lines[j].startswith(">"):
                buf.append(lines[j].lstrip("> ")); j += 1
            out.append("<blockquote>" + inline(" ".join(buf)) + "</blockquote>"); i = j
        elif not ln.strip():
            i += 1
        else:
            j, buf = i, []
            while j < len(lines) and lines[j].strip() and not lines[j].startswith(("```", "#", ">")) and not re.match(r"^\s*([-*]|\d+\.) ", lines[j]):
                buf.append(lines[j]); j += 1
            out.append("<p>" + inline(" ".join(buf)) + "</p>"); i = max(j, i + 1)
    return "\n".join(out)


# ---------- page ----------
parts = []
for n, t in enumerate(turns, 1):
    user = scrub(t["user"])
    resp = scrub("\n\n".join(t["text"])) or "(no text reply: only actions)"
    acts = [scrub(a) for a in t["actions"]]
    label = "You ran a command" if t["kind"] == "shell" else "You"
    user_html = f"<pre class='shell'>{html.escape(user)}</pre>" if t["kind"] == "shell" else f"<div class='msg'>{html.escape(user).replace(chr(10), '<br>')}</div>"
    acts_html = ("<details class='acts'><summary>Actions taken (" + str(len(acts)) + ")</summary><ul>" + "".join(f"<li>{html.escape(a)}</li>" for a in acts) + "</ul></details>") if acts else ""
    parts.append(
        f"<section class='turn' id='turn-{n}'><h2><a href='#turn-{n}'>Turn {n}</a></h2>"
        f"<div class='who'>{label}</div>{user_html}"
        f"<details class='resp'><summary>Claude's response ({len(t['text'])} message{'s' if len(t['text']) != 1 else ''}, {len(acts)} action{'s' if len(acts) != 1 else ''})</summary>"
        f"<div class='body'>{md(resp)}{acts_html}</div></details></section>"
    )

nav = " ".join(f"<a href='#turn-{n}'>{n}</a>" for n in range(1, len(turns) + 1))
page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<style>
:root {{ --bg:#f6f4ee; --card:#fffdf9; --ink:#1d2327; --muted:#5f6a70; --line:#ddd7c8; --accent:#14597a; --code:#f0ece1; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#121618; --card:#1b2125; --ink:#ebe8e0; --muted:#a0abb1; --line:#2e383d; --accent:#7cc3e2; --code:#232b30; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif; }}
.wrap {{ max-width:52rem; margin:0 auto; padding:0 16px 3rem; }} h1 {{ font-family:Georgia,serif; margin:1.6rem 0 .2rem; }}
.sub {{ color:var(--muted); margin:0 0 1rem; }} .bar {{ position:sticky; top:0; background:var(--bg); padding:.6rem 0; border-bottom:1px solid var(--line); display:flex; gap:8px; flex-wrap:wrap; align-items:center; z-index:2; }}
.bar button {{ border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:8px; padding:.35rem .8rem; cursor:pointer; font:inherit; }}
.bar input {{ flex:1 1 12rem; border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:8px; padding:.4rem .7rem; font:inherit; }}
.jump {{ font-size:.8rem; color:var(--muted); margin:.6rem 0; line-height:2; }} .jump a {{ display:inline-block; min-width:1.9rem; text-align:center; border:1px solid var(--line); border-radius:6px; margin:0 2px; text-decoration:none; color:var(--accent); background:var(--card); }}
.turn {{ background:var(--card); border:1px solid var(--line); border-radius:14px; padding:.9rem 1.1rem; margin:1rem 0; scroll-margin-top:4rem; }}
.turn h2 {{ font-size:1rem; margin:0 0 .3rem; }} .turn h2 a {{ color:var(--accent); text-decoration:none; }} .who {{ font-size:.75rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:700; }}
.msg {{ border-left:4px solid var(--accent); padding:.3rem .8rem; margin:.3rem 0 .7rem; overflow-wrap:anywhere; background:var(--code); border-radius:0 8px 8px 0; }}
pre {{ background:var(--code); border-radius:8px; padding:.7rem .9rem; overflow-x:auto; font-size:.85rem; }} pre.shell {{ border-left:4px solid var(--muted); white-space:pre-wrap; word-break:break-word; }}
details.resp > summary {{ cursor:pointer; font-weight:600; color:var(--accent); }} .body {{ padding-top:.5rem; overflow-wrap:anywhere; }}
.body code {{ background:var(--code); padding:.05rem .3rem; border-radius:4px; font-size:.88em; }} .body pre code {{ padding:0; background:none; }}
.tw {{ overflow-x:auto; }} table {{ border-collapse:collapse; font-size:.9rem; }} th,td {{ border:1px solid var(--line); padding:.3rem .55rem; text-align:left; vertical-align:top; }}
.body blockquote {{ margin:.5rem 0; padding:.3rem .8rem; border-left:3px solid var(--accent); background:var(--code); }} .acts {{ margin-top:.7rem; font-size:.88rem; color:var(--muted); }}
.hide {{ display:none; }} footer {{ color:var(--muted); font-size:.85rem; margin-top:2rem; }}
</style></head><body><div class="wrap">
<h1>{html.escape(title)}</h1>
<p class="sub">{len(turns)} turns. Each turn shows what the user typed (or ran); Claude's reply is collapsed beneath it. Personal details, keys and tool outputs have been removed.</p>
<div class="bar"><button id="open">Expand all</button><button id="close">Collapse all</button><input id="q" type="search" placeholder="Filter turns by text…" aria-label="Filter turns"></div>
<div class="jump">Jump to: {nav}</div>
{''.join(parts)}
<footer>Generated from the session log by <code>scripts/build-transcript.py</code>.</footer>
</div>
<script>
const all = () => [...document.querySelectorAll('details.resp')];
document.getElementById('open').onclick = () => all().forEach(d => d.open = true);
document.getElementById('close').onclick = () => all().forEach(d => d.open = false);
document.getElementById('q').oninput = e => {{ const v = e.target.value.toLowerCase(); document.querySelectorAll('.turn').forEach(t => t.classList.toggle('hide', v && !t.textContent.toLowerCase().includes(v))); }};
if (location.hash) {{ const t = document.querySelector(location.hash); const d = t && t.querySelector('details.resp'); if (d) d.open = true; }}
</script></body></html>"""
out.write_text(page)
print(f"{len(turns)} turns -> {out} ({out.stat().st_size // 1024} KB)")
