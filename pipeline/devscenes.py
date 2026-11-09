"""Data preparation for the developer scenes: code (highlighted tokens, diffs), git history, diagrams.

The Remotion templates only draw; everything that needs a parser or the file system happens here.
"""
from __future__ import annotations

import difflib
import subprocess
from collections import Counter
from datetime import date, datetime
from pathlib import Path

# One Dark-like palette, readable on the kit's dark backgrounds.
PALETTE = {
    "Keyword": "#C678DD", "Name.Function": "#61AFEF", "Name.Class": "#E5C07B", "Name.Builtin": "#E5C07B",
    "Name.Decorator": "#61AFEF", "Name.Tag": "#E06C75", "Name.Attribute": "#D19A66", "Literal.String": "#98C379",
    "Literal.Number": "#D19A66", "Comment": "#7F848E", "Operator": "#56B6C2", "Punctuation": "#ABB2BF",
    "Name.Variable": "#E06C75", "Name.Constant": "#D19A66", "Name.Namespace": "#E5C07B", "Generic": "#ABB2BF",
}
DEFAULT_COLOR = "#ABB2BF"


def _color(ttype) -> str:
    while ttype is not None:
        name = str(ttype).replace("Token.", "")
        if name in PALETTE:
            return PALETTE[name]
        ttype = ttype.parent if ttype.parent is not ttype else None
    return DEFAULT_COLOR


def _lexer(lang: str | None, filename: str | None, text: str):
    from pygments.lexers import get_lexer_by_name, get_lexer_for_filename, guess_lexer

    try:
        if lang:
            return get_lexer_by_name(lang)
        if filename:
            return get_lexer_for_filename(filename)
    except Exception:
        pass
    try:
        return guess_lexer(text)
    except Exception:
        return get_lexer_by_name("text")


def highlight(text: str, lang: str | None = None, filename: str | None = None) -> list[list[list[str]]]:
    """Lines of [text, colour] tokens."""
    lexer = _lexer(lang, filename, text)
    lines: list[list[list[str]]] = [[]]
    for ttype, value in lexer.get_tokens(text.expandtabs(4)):
        parts = value.split("\n")
        for i, part in enumerate(parts):
            if i:
                lines.append([])
            if part:
                lines[-1].append([part, _color(ttype)])
    while lines and not lines[-1]:
        lines.pop()
    return lines


def code_lines(text: str, lang: str | None, filename: str | None, start: int = 1, end: int | None = None) -> list[dict]:
    hl = highlight(text, lang, filename)
    end = end or len(hl)
    return [{"n": i, "tokens": hl[i - 1]} for i in range(start, min(end, len(hl)) + 1)]


def diff_lines(before: str, after: str, lang: str | None, filename: str | None) -> list[dict]:
    """Unified view: unchanged lines plus removed (-) and added (+) ones, each with highlighted tokens."""
    hb, ha = highlight(before, lang, filename), highlight(after, lang, filename)
    a, b = before.expandtabs(4).splitlines(), after.expandtabs(4).splitlines()
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if op == "equal":
            out += [{"kind": " ", "n": j + 1, "tokens": ha[j] if j < len(ha) else []} for j in range(j1, j2)]
        else:
            out += [{"kind": "-", "tokens": hb[i] if i < len(hb) else []} for i in range(i1, i2)]
            out += [{"kind": "+", "n": j + 1, "tokens": ha[j] if j < len(ha) else []} for j in range(j1, j2)]
    return out


def git_history(repo: Path, since: str | None = None, until: str | None = None, path: str | None = None) -> dict:
    """Commits with date, author, subject and line counts, oldest first, plus totals and a daily series."""
    cmd = ["git", "-C", str(repo), "log", "--no-merges", "--date=short", "--pretty=format:@@%ad\t%an\t%s", "--numstat"]
    if since:
        cmd.append(f"--since={since}")
    if until:
        cmd.append(f"--until={until}")
    if path:
        cmd += ["--", path]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"git log failed in {repo}: {res.stderr.strip()[:300]}")
    commits = []
    for block in res.stdout.split("@@")[1:]:
        head, *stats = block.strip("\n").split("\n")
        d, author, subject = (head.split("\t") + ["", ""])[:3]
        add = dele = 0
        for s in stats:
            parts = s.split("\t")
            if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
                add += int(parts[0])
                dele += int(parts[1])
        commits.append({"date": d, "author": author, "msg": subject, "add": add, "del": dele})
    commits.reverse()
    if not commits:
        raise RuntimeError(f"No commits found in {repo} for that range")
    days = [datetime.strptime(c["date"], "%Y-%m-%d").date() for c in commits]
    span = (days[-1] - days[0]).days + 1
    per_day = Counter(days)
    series = [per_day.get(date.fromordinal(days[0].toordinal() + i), 0) for i in range(span)]
    return {
        "repo": repo.name,
        "commits": commits,
        "totals": {"commits": len(commits), "add": sum(c["add"] for c in commits), "del": sum(c["del"] for c in commits),
                   "authors": len({c["author"] for c in commits}), "days": span, "first": commits[0]["date"], "last": commits[-1]["date"]},
        "series": series,
    }


def layout_diagram(nodes: list[dict], edges: list[dict], vertical: bool) -> list[dict]:
    """Layered layout: each node's level = longest path from a source; spread levels along the main axis.

    Positions are normalised 0..1. Nodes with explicit "x"/"y" keep them.
    """
    ids = [n["id"] for n in nodes]
    preds = {i: [e["from"] for e in edges if e["to"] == i and e["from"] in ids] for i in ids}
    level: dict[str, int] = {}

    def lvl(i: str, seen=()) -> int:
        if i in level:
            return level[i]
        if i in seen:
            return 0
        level[i] = 0 if not preds[i] else 1 + max(lvl(p, seen + (i,)) for p in preds[i])
        return level[i]

    for i in ids:
        lvl(i)
    for n in nodes:  # an explicit "level" wins
        if "level" in n:
            level[n["id"]] = int(n["level"])
    depth = max(level.values()) + 1
    by_level: dict[int, list[str]] = {}
    for i in ids:
        by_level.setdefault(level[i], []).append(i)
    out = []
    for n in nodes:
        lv = level[n["id"]]
        row = by_level[lv]
        k = row.index(n["id"])
        main = (lv + 0.5) / depth
        cross = (k + 0.5) / len(row)
        x, y = (cross, main) if vertical else (main, cross)
        out.append({**n, "x": float(n.get("x", x)), "y": float(n.get("y", y)), "level": lv})
    return out
